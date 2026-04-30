import { useEffect, useMemo, useReducer, useState } from "react";

import { initialState, reducer, type ReducerAction } from "./reducer";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Titlebar } from "./app/Titlebar";
import { StackView } from "./app/StackView";
import { countAllTasks, findFirstOpen } from "./tree";
import type { AppState } from "./types";
import { PortalContext, type PortalAPI } from "./windows/portal/context";
import { initPortalBridge } from "./windows/portal/bridge";
import {
  createWindowManager,
  WINDOWS,
  type WindowManager,
} from "./windows";
import { useBlurToHide } from "./hooks/useBlurToHide";
import { useKeyboardDispatcher } from "./hooks/useKeyboardDispatcher";
import { useLatestRef } from "./hooks/useLatestRef";
import { useMainWindow } from "./hooks/useMainWindow";
import { useMidnightReset, localDateKey } from "./hooks/useMidnightReset";
import { usePersistence } from "./hooks/usePersistence";
import { useShortcutSync } from "./hooks/useShortcutSync";
import "./App.css";

// The main window's body — everything below the titlebar — is just the
// stack view, plus a confirm-dialog overlay when the user is about to
// delete a stack. Quick / search / settings each render in their own
// webview (see src/windows/<name>/host.tsx).
export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Live refs for hook handlers that attach once but need fresh reads.
  const stateRef = useLatestRef(state);
  const overridesRef = useLatestRef(state.overrides);

  // Effects, in order of dependency. Each is one named, single-purpose hook.
  const todayKey = useMemo(() => localDateKey(new Date()), []);
  const { hydrated } = usePersistence({ state, dispatch, todayKey });
  useShortcutSync({ hydrated, overrides: state.overrides, dispatch });
  useKeyboardDispatcher({ stateRef, overridesRef, dispatch });
  useMainWindow({ state, stateRef, dispatch });
  useBlurToHide({ stateRef, dispatch });
  useMidnightReset({ hydrated, dispatch });
  useAuxWindows({ state, dispatch });

  return <MainBody state={state} dispatch={dispatch} />;
}

function MainBody({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: (a: ReducerAction) => void;
}) {
  const portalAPI = usePortalAPI(dispatch);
  const activeStack = useMemo(
    () => state.stacks.find((s) => s.id === state.activeStackId) ?? null,
    [state.stacks, state.activeStackId]
  );
  const headline = useMemo(() => {
    const firstOpen = findFirstOpen(activeStack?.tasks ?? []);
    return firstOpen?.text ?? "Nothing on the stack";
  }, [activeStack]);
  const confirmingStack =
    state.confirming?.kind === "delete-stack"
      ? state.stacks.find((s) => s.id === state.confirming!.stackId) ?? null
      : null;
  const hotkeyFailures = useMemo(
    () => hasHotkeyFailures(state),
    [state.registrationOutcomes]
  );

  return (
    <PortalContext.Provider value={portalAPI}>
      <div className="app view-stack">
        <Titlebar
          titleText={headline}
          pinned={state.pinned}
          onOpenSettings={() =>
            dispatch({ type: "present.toggle", window: "settings" })
          }
          onTogglePin={() => dispatch({ type: "toggle-pin" })}
          onHide={() => dispatch({ type: "present.set", window: null })}
        />
        <StackView
          state={state}
          activeStack={activeStack}
          hasHotkeyFailures={hotkeyFailures}
          dispatch={dispatch}
          onOpenSettings={() =>
            dispatch({ type: "present.toggle", window: "settings" })
          }
        />
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

// Initialize the portal bridge (showMenu Promise contract used by Menu /
// StackSelect). The aux-windows hook initializes the manager that handles
// the OS-level visibility — the bridge is a thin layer on top.
function usePortalAPI(dispatch: (a: ReducerAction) => void): PortalAPI | null {
  const [api, setApi] = useState<PortalAPI | null>(null);
  useEffect(() => {
    let cancelled = false;
    initPortalBridge({ dispatch })
      .then((a) => {
        if (!cancelled) setApi(a);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dispatch]);
  return api;
}

// Initialize and reconcile the auxiliary windows (quick, search, settings,
// portal). One init, then a reconcile every state change — the manager
// diffs internally so this is cheap when nothing relevant changed.
function useAuxWindows(opts: {
  state: AppState;
  dispatch: (a: ReducerAction) => void;
}) {
  const [manager, setManager] = useState<WindowManager<AppState> | null>(null);

  useEffect(() => {
    let cancelled = false;
    createWindowManager<AppState>(WINDOWS, opts.dispatch)
      .then((m) => {
        if (!cancelled) setManager(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [opts.dispatch]);

  useEffect(() => {
    manager?.reconcile(opts.state).catch(() => {});
  }, [manager, opts.state]);
}

function hasHotkeyFailures(state: AppState): boolean {
  // An action is failing iff none of its registered accels succeeded.
  // Fallbacks count as success — the user still has a working shortcut.
  const succeeded = new Set<string>();
  const seen = new Set<string>();
  for (const o of state.registrationOutcomes) {
    seen.add(o.action);
    if (o.succeeded) succeeded.add(o.action);
  }
  for (const a of seen) if (!succeeded.has(a)) return true;
  return false;
}


