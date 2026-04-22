import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { info, warn, error as logError } from "@tauri-apps/plugin-log";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

import {
  ACTIONS,
  actionInScope,
  getBindings,
  normalizeOverrides,
  type ActionId,
  type BindingOverrides,
  type Scope,
} from "./actions";
import { combosEqual, comboToAccelerator, eventToCombo } from "./keys";
import { initialState, reducer } from "./reducer";
import {
  loadBindings,
  loadState,
  saveBindings,
  saveState,
} from "./storage";
import { Settings } from "./components/Settings";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Titlebar } from "./app/Titlebar";
import { QuickView } from "./app/QuickView";
import { StackView } from "./app/StackView";
import { countAllTasks, findFirstOpen } from "./tree";
import type { AppState, View, WindowSize } from "./types";
import { PortalContext, type PortalAPI } from "./portal/context";
import { initPortalBridge, isPortalActive } from "./portal/bridge";
import "./App.css";

// Mirrors the Rust `ShortcutOutcome` struct in src-tauri/src/lib.rs.
type RegistrationOutcome = {
  action: ActionId;
  accel: string;
  succeeded: boolean;
  fallback: boolean;
  error: string | null;
};

type ShortcutRequest = {
  action: ActionId;
  accel: string;
  fallback: boolean;
};

// Per-view geometry. Quick-add is a palette (fixed, non-resizable,
// centered); stack and settings are tool windows the user can drag and
// resize. We own min/max/resizable from here because tauri.conf.json
// constraints would otherwise fight our setSize calls.
type ViewGeometry = {
  w: number;
  h: number;
  resizable: boolean;
};

const DEFAULT_STACK_SIZE: WindowSize = { w: 480, h: 360 };

function geometryForView(
  view: View,
  stackViewSize: WindowSize | null
): ViewGeometry {
  switch (view.kind) {
    case "quick":
      // Budget (all values worst-case, rounded up):
      //   titlebar ~38  (8+6 padding + 22 content + 1 border)
      //   .quick:  14 top + 32 input row + 10 gap + 16 hint + 20 bottom = 92
      //   total:   ~130, round up for OS chrome variance.
      return { w: 620, h: 148, resizable: false };
    case "settings":
      return { w: 560, h: 620, resizable: true };
    case "stack": {
      const size = stackViewSize ?? DEFAULT_STACK_SIZE;
      return { w: size.w, h: size.h, resizable: true };
    }
  }
}

const RESIZABLE_MIN = { w: 360, h: 320 };

// Local-date key (YYYY-MM-DD). Compared against state.lastHabitResetDate to
// decide whether a midnight boundary was crossed. Local, not UTC — "midnight"
// means the user's wall-clock midnight.
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 50); // +50ms slack so the timer fires *after* midnight
  return next.getTime() - now.getTime();
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [overrides, setOverridesRaw] = useState<BindingOverrides>({});
  // Persistence is async (file-backed via tauri-plugin-store). Gate
  // write-back effects and shortcut reconciliation on `hydrated` so first
  // render doesn't clobber the stored values with empty defaults.
  const [hydrated, setHydrated] = useState(false);

  // Every write is normalized — guarantees stored overrides are collision-free
  // regardless of how they got in (stale file, race, future bug).
  const setOverrides = useCallback(
    (updater: (prev: BindingOverrides) => BindingOverrides) => {
      setOverridesRaw((prev) => normalizeOverrides(updater(prev)));
    },
    []
  );

  const [registrationOutcomes, setRegistrationOutcomes] = useState<
    RegistrationOutcome[]
  >([]);

  const [portalAPI, setPortalAPI] = useState<PortalAPI | null>(null);

  // Refs keep handlers stable without forcing re-registration on every state
  // change — effects that reconcile to the OS still see the latest snapshot.
  const stateRef = useRef(state);
  const overridesRef = useRef(overrides);
  stateRef.current = state;
  overridesRef.current = overrides;

  // --- Hydration ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    info("hydration: start");
    (async () => {
      try {
        const [persistedState, persistedBindings] = await Promise.all([
          loadState(),
          loadBindings(),
        ]);
        if (cancelled) return;
        info(
          `hydration: loaded stacks=${persistedState?.stacks.length ?? 0} overrides=${Object.keys(persistedBindings).length}`
        );
        if (persistedState) {
          dispatch({
            type: "hydrate",
            stacks: persistedState.stacks,
            activeStackId: persistedState.activeStackId,
            pinned: persistedState.pinned,
            stackViewSize: persistedState.stackViewSize,
            lastHabitResetDate: persistedState.lastHabitResetDate,
          });
          // Catch up on any midnight boundaries crossed while the app was
          // closed or asleep. The scheduler effect below keeps it current
          // while we're running.
          dispatch({
            type: "habits.reset-if-stale",
            today: localDateKey(new Date()),
          });
        }
        setOverridesRaw(normalizeOverrides(persistedBindings));
      } catch (err) {
        warn(`hydration: failed: ${err}`);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState(state);
  }, [state, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    saveBindings(overrides);
  }, [overrides, hydrated]);

  // --- Portal window for floating UI (menus, dropdowns) ---
  useEffect(() => {
    let cancelled = false;
    initPortalBridge().then((api) => {
      if (!cancelled) setPortalAPI(api);
    }).catch((err) => {
      logError(`portal init failed: ${err}`);
    });
    return () => { cancelled = true; };
  }, []);

  // --- Action dispatcher ----------------------------------------------------
  // fire() is thin: it dispatches reducer actions. Native side-effects (show,
  // hide, resize) are reconciled in dedicated effects below, reacting to
  // state changes. This keeps action handlers pure and testable.
  const fire = useCallback((id: ActionId, e?: Event | React.SyntheticEvent) => {
    const prevent = () => e?.preventDefault();
    switch (id) {
      case "app.toggle-window":
        dispatch({ type: "window.toggle" });
        return;
      case "app.quick-add":
        dispatch({ type: "view.toggle-quick" });
        return;
      case "app.hide":
        prevent();
        dispatch({ type: "window.hide" });
        return;
      case "app.pin-toggle":
        dispatch({ type: "toggle-pin" });
        return;
      case "app.open-settings":
        prevent();
        dispatch({ type: "view.open-settings" });
        return;

      case "nav.prev-stack":
        prevent();
        dispatch({ type: "cycle-stack", dir: -1 });
        return;
      case "nav.next-stack":
        prevent();
        dispatch({ type: "cycle-stack", dir: 1 });
        return;
      case "nav.prev-task":
        prevent();
        dispatch({ type: "nav-task", dir: -1 });
        return;
      case "nav.next-task":
        prevent();
        dispatch({ type: "nav-task", dir: 1 });
        return;

      case "task.toggle":
        prevent();
        dispatch({ type: "toggle-selected" });
        return;
      case "task.toggle-habit":
        prevent();
        dispatch({ type: "toggle-habit-selected" });
        return;
      case "task.delete":
        prevent();
        dispatch({ type: "delete-selected" });
        return;
      case "task.indent":
        prevent();
        dispatch({ type: "indent-selected" });
        return;
      case "task.outdent":
        prevent();
        dispatch({ type: "outdent-selected" });
        return;
      case "task.new-here":
        prevent();
        dispatch({ type: "new-task-here-start" });
        return;
      case "task.new-on-top":
        prevent();
        dispatch({ type: "new-task-on-top-start" });
        return;

      case "stack.new":
        prevent();
        dispatch({ type: "new-stack-start" });
        return;
      case "stack.rename-active":
        prevent();
        dispatch({ type: "rename-active-stack-start" });
        return;
      case "stack.delete-active":
        prevent();
        dispatch({ type: "request-delete-active-stack" });
        return;

      case "quick.commit":
        prevent();
        dispatch({ type: "quick-add.commit" });
        return;
      case "quick.cancel":
        prevent();
        dispatch({ type: "quick-add.cancel" });
        return;

      case "settings.exit":
        prevent();
        dispatch({ type: "settings.exit" });
        return;

      case "modal.confirm":
        prevent();
        dispatch({ type: "confirm-commit" });
        return;
      case "modal.cancel":
        prevent();
        dispatch({ type: "confirm-cancel" });
        return;

      // These are handled inside EditingInput (Enter / Escape with
      // stopPropagation). Listed here for completeness and future use from
      // the dispatcher.
      case "edit.commit":
      case "edit.cancel":
        return;
    }
  }, []);

  // --- Keyboard dispatcher --------------------------------------------------
  const resolveScope = useCallback((s: AppState): Scope => {
    if (s.confirming) return "modal";
    if (s.editing) return "edit";
    switch (s.view.kind) {
      case "quick":
        return "quick";
      case "settings":
        return "settings";
      case "stack":
        return "list";
    }
  }, []);

  // Window-level keyboard dispatcher. Listening on `window` (not the root
  // element) decouples shortcuts from DOM focus — after a titlebar drag or
  // any stray focus shift, Escape / etc. still reach us. Inputs that want to
  // own a key (EditingInput, Settings recorder) call stopPropagation on their
  // own handlers, which run first on the actual target.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const combo = eventToCombo(e);
      const scope = resolveScope(stateRef.current);
      const chain: Scope[] = [scope, "global"];
      for (const sc of chain) {
        for (const action of ACTIONS) {
          if (!actionInScope(action, sc)) continue;
          const bindings = getBindings(action.id, overridesRef.current);
          if (bindings.some((b) => combosEqual(b, combo))) {
            fire(action.id, e);
            return;
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fire, resolveScope]);

  // --- OS-global shortcut reconciliation ------------------------------------
  // Rust owns registration. We compute the plan (overrides first, defaults
  // as lockout-prevention fallbacks) and hand it to `set_shortcuts`, which
  // atomically clears and re-registers. That's what makes this HMR-safe:
  // the Rust process outlives every JS reload, so reconciling into a
  // process-level registry can't get stuck in a "previous lifetime still
  // owns this accel" state.
  useEffect(() => {
    if (!hydrated) return;

    const requests: ShortcutRequest[] = [];
    for (const action of ACTIONS) {
      if (!actionInScope(action, "global-os")) continue;

      // Three cases, mirroring the prior JS logic:
      //   - No override         → try defaults; no fallback needed.
      //   - Override has combos → try them, with defaults appended as
      //                           fallbacks so a bad override can't
      //                           lock the user out.
      //   - Override is empty[] → user explicitly unbound. Respect it.
      const hasOverride = action.id in overrides;
      const overriddenCombos = hasOverride ? (overrides[action.id] ?? []) : [];
      const explicitlyUnbound = hasOverride && overriddenCombos.length === 0;
      const primary = hasOverride ? overriddenCombos : action.defaultBindings;

      for (const combo of primary) {
        requests.push({
          action: action.id,
          accel: comboToAccelerator(combo),
          fallback: false,
        });
      }
      if (hasOverride && !explicitlyUnbound) {
        for (const combo of action.defaultBindings) {
          requests.push({
            action: action.id,
            accel: comboToAccelerator(combo),
            fallback: true,
          });
        }
      }
    }

    info(`reconcile: invoking set_shortcuts with ${requests.length} request(s)`);
    let cancelled = false;
    (async () => {
      try {
        const outcomes = await invoke<RegistrationOutcome[]>("set_shortcuts", {
          requests,
        });
        if (cancelled) return;
        const okCount = outcomes.filter((o) => o.succeeded).length;
        info(`reconcile: ${okCount}/${outcomes.length} registered`);
        for (const o of outcomes) {
          if (!o.succeeded) {
            warn(`reconcile: failed ${o.action} [${o.accel}]: ${o.error ?? "?"}`);
          }
        }
        setRegistrationOutcomes(outcomes);

        // Lockout rescue: if the window-toggle shortcut isn't registered
        // — for any reason, including the user explicitly unbinding it —
        // surface the window so they can reach settings. An unbound toggle
        // + a hidden window is the one state we never want to be stuck in,
        // because there's no way out without killing the process.
        const toggleSucceeded = outcomes.some(
          (o) => o.action === "app.toggle-window" && o.succeeded
        );
        if (!toggleSucceeded) {
          warn("reconcile: app.toggle-window not registered; showing window");
          dispatch({ type: "window.show" });
        }
      } catch (err) {
        logError(`reconcile: set_shortcuts invoke failed: ${err}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [overrides, hydrated]);

  // Rust emits `shortcut:fired` with the action id when a bound accel
  // fires. Listener rebinds freely across HMR — nothing at the OS level
  // cares who's listening.
  useEffect(() => {
    const unlistenP = listen<string>("shortcut:fired", (ev) => {
      info(`shortcut:fired received → ${ev.payload}`);
      fire(ev.payload as ActionId);
    });
    return () => {
      unlistenP.then((u) => u()).catch(() => {});
    };
  }, [fire]);

  // --- Window reconciler ----------------------------------------------------
  // Sole source of truth for size, min/max, resizability, and visibility.
  // On the hidden→visible edge we apply the current view's geometry; for the
  // resizable stack view that geometry includes the user's remembered size,
  // so reopening the window restores the last shape they left.
  useEffect(() => {
    const win = getCurrentWindow();
    const geo = geometryForView(state.view, state.stackViewSize);
    (async () => {
      try {
        const isVisible = await win.isVisible();
        if (state.windowVisible) {
          if (!isVisible) {
            await win.setMinSize(null);
            await win.setMaxSize(null);
            await win.setSize(new LogicalSize(geo.w, geo.h));

            if (geo.resizable) {
              await win.setMinSize(
                new LogicalSize(RESIZABLE_MIN.w, RESIZABLE_MIN.h)
              );
              await win.setResizable(true);
            } else {
              await win.setMinSize(new LogicalSize(geo.w, geo.h));
              await win.setMaxSize(new LogicalSize(geo.w, geo.h));
              await win.setResizable(false);
              await win.center();
            }

            // Double-rAF lets the compositor commit the new DOM into the
            // (still-hidden) webview before the OS surface reveals it —
            // otherwise you see a tick of the previous view's last frame.
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve())
              );
            });
            await invoke("show_stack");
          }
        } else if (isVisible) {
          await win.hide();
          // If the user asked to switch views while visible, the reducer
          // parked the target in pendingOpen and hid the window. Now the
          // OS surface is gone, we can commit that target — React will
          // paint the new view into the hidden webview, and the next
          // reconcile pass will resize + show at the new geometry.
          if (stateRef.current.pendingOpen) {
            dispatch({ type: "commit-pending-open" });
          }
        }
      } catch (err) {
        logError(`window reconcile failed: ${err}`);
      }
    })();
  }, [state.view, state.windowVisible, state.stackViewSize]);

  // --- Persist user resize of the stack view -------------------------------
  // The native resize handle is the only input here; we listen to
  // `tauri://resize`, debounce so rapid drag events don't thrash state,
  // and only persist while the stack view is the one on screen.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let timer: number | null = null;
    const win = getCurrentWindow();
    (async () => {
      unlisten = await win.onResized(({ payload }) => {
        const s = stateRef.current;
        if (!s.windowVisible || s.view.kind !== "stack") return;
        // payload is PhysicalSize; convert to logical via scale factor.
        (async () => {
          try {
            const scale = await win.scaleFactor();
            const size: WindowSize = {
              w: Math.round(payload.width / scale),
              h: Math.round(payload.height / scale),
            };
            if (timer !== null) clearTimeout(timer);
            timer = window.setTimeout(() => {
              timer = null;
              const cur = stateRef.current.stackViewSize;
              if (cur && cur.w === size.w && cur.h === size.h) return;
              dispatch({ type: "stack-view-resized", size });
            }, 150);
          } catch (err) {
            logError(`resize persist failed: ${err}`);
          }
        })();
      });
    })();
    return () => {
      if (timer !== null) clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  // --- Blur-to-hide with grace window --------------------------------------
  useEffect(() => {
    let unlistenBlur: (() => void) | null = null;
    let hideTimer: number | null = null;
    const win = getCurrentWindow();

    (async () => {
      unlistenBlur = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          if (hideTimer !== null) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }
          return;
        }
        const s = stateRef.current;
        if (s.pinned) return;
        if (s.view.kind === "settings") return;
        if (s.confirming) return;
        // Don't hide while a portal menu/dropdown is open — the portal
        // window steals focus, which fires this blur, but the user is
        // still interacting with the app.
        if (isPortalActive()) return;
        if (hideTimer !== null) clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
          hideTimer = null;
          // Re-check: portal may have opened during the grace window.
          if (isPortalActive()) return;
          dispatch({ type: "window.hide" });
        }, 180);
      });
    })();

    return () => {
      if (hideTimer !== null) clearTimeout(hideTimer);
      unlistenBlur?.();
    };
  }, []);

  // --- Habit midnight reset ------------------------------------------------
  // Fires once per local midnight. Sleep/wake is covered by re-scheduling
  // from `now` every time we tick, and by the window-focus / hydration
  // catch-up paths that also dispatch `habits.reset-if-stale`.
  useEffect(() => {
    if (!hydrated) return;
    let timer: number | null = null;
    const schedule = () => {
      const now = new Date();
      timer = window.setTimeout(() => {
        dispatch({ type: "habits.reset-if-stale", today: localDateKey(new Date()) });
        schedule();
      }, msUntilNextLocalMidnight(now));
    };
    schedule();
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [hydrated]);

  // Belt-and-braces: on focus, check whether we crossed midnight while the
  // window was hidden / the machine was suspended. The reducer no-ops when
  // today's date already matches, so this is cheap to call redundantly.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const win = getCurrentWindow();
    (async () => {
      unlisten = await win.onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        dispatch({
          type: "habits.reset-if-stale",
          today: localDateKey(new Date()),
        });
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  // --- Derived --------------------------------------------------------------
  const activeStack = useMemo(
    () => state.stacks.find((s) => s.id === state.activeStackId) ?? null,
    [state.stacks, state.activeStackId]
  );

  const headline = useMemo(() => {
    const firstOpen = findFirstOpen(activeStack?.tasks ?? []);
    return firstOpen?.text ?? "Nothing on the stack";
  }, [activeStack]);

  const titleText =
    state.view.kind === "quick"
      ? "Quick add"
      : state.view.kind === "settings"
        ? "Settings"
        : headline;

  const confirmingStack =
    state.confirming?.kind === "delete-stack"
      ? state.stacks.find((s) => s.id === state.confirming!.stackId) ?? null
      : null;

  const hotkeyFailures = useMemo(
    () => hasHotkeyFailures(registrationOutcomes),
    [registrationOutcomes]
  );

  return (
    <PortalContext.Provider value={portalAPI}>
      <div className={`app view-${state.view.kind}`}>
      <Titlebar
        view={state.view}
        titleText={titleText}
        pinned={state.pinned}
        onOpenSettings={() => fire("app.open-settings")}
        onTogglePin={() => dispatch({ type: "toggle-pin" })}
        onHide={() => dispatch({ type: "window.hide" })}
      />

      {state.view.kind === "quick" ? (
        <QuickView
          draft={state.view.draft}
          stacks={state.stacks}
          activeStackId={state.activeStackId}
          dispatch={dispatch}
          onCommit={() => fire("quick.commit")}
          onCancel={() => fire("quick.cancel")}
        />
      ) : state.view.kind === "settings" ? (
        <Settings
          tab={state.view.tab}
          overrides={overrides}
          setOverrides={setOverrides}
          registrationOutcomes={registrationOutcomes}
          onExit={() => dispatch({ type: "settings.exit" })}
          onSetTab={(tab) => dispatch({ type: "view.settings-set-tab", tab })}
        />
      ) : (
        <StackView
          state={state}
          activeStack={activeStack}
          hasHotkeyFailures={hotkeyFailures}
          dispatch={dispatch}
          onOpenSettings={() => dispatch({ type: "view.open-settings" })}
        />
      )}

      {confirmingStack && (
        <ConfirmDialog
          title="Delete stack?"
          body={`"${confirmingStack.name || "Untitled"}" and its ${countAllTasks(
            confirmingStack.tasks
          )} task${countAllTasks(confirmingStack.tasks) === 1 ? "" : "s"} will be permanently removed.`}
          destructive
          confirmLabel="Delete"
          onConfirm={() => dispatch({ type: "confirm-commit" })}
          onCancel={() => dispatch({ type: "confirm-cancel" })}
        />
      )}
      </div>
    </PortalContext.Provider>
  );
}

function hasHotkeyFailures(outcomes: RegistrationOutcome[]): boolean {
  // An action is failing iff none of its registered accels succeeded.
  // Fallbacks count as success — the user still has a working shortcut.
  const succeeded = new Set<ActionId>();
  const seen = new Set<ActionId>();
  for (const o of outcomes) {
    seen.add(o.action);
    if (o.succeeded) succeeded.add(o.action);
  }
  for (const a of seen) if (!succeeded.has(a)) return true;
  return false;
}

