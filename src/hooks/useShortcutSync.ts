/**
 * OS-global shortcut reconciler. Rust owns registration; we hand it the
 * current plan (overrides first, defaults appended as lockout-prevention
 * fallbacks) every time `overrides` changes. Rust atomically clears and
 * re-registers, which is HMR-safe: the Rust process outlives every JS
 * reload.
 *
 * Also installs the `shortcut:fired` listener — Rust emits this event
 * when an OS-global combo fires; we resolve the matching action and
 * dispatch it.
 */

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { info, warn, error as logError } from "@tauri-apps/plugin-log";
import {
  ACTIONS,
  ACTIONS_BY_ID,
  actionInScope,
  resolveDispatch,
  type ActionId,
  type BindingOverrides,
} from "../actions";
import { comboToAccelerator } from "../keys";
import type { ReducerAction } from "../reducer";
import type { RegistrationOutcome } from "../types";

type ShortcutRequest = {
  action: ActionId;
  accel: string;
  fallback: boolean;
};

// Shape from Rust: includes an `error` field we don't store on the
// reducer outcome type — the reducer only needs success/failure for UI.
type RawOutcome = {
  action: ActionId;
  accel: string;
  succeeded: boolean;
  fallback: boolean;
  error: string | null;
};

export function useShortcutSync(opts: {
  hydrated: boolean;
  overrides: BindingOverrides;
  dispatch: (action: ReducerAction) => void;
}): void {
  const { hydrated, overrides, dispatch } = opts;

  // Reconcile registrations whenever overrides (or hydration) change.
  useEffect(() => {
    if (!hydrated) return;

    const requests: ShortcutRequest[] = [];
    for (const action of ACTIONS) {
      if (!actionInScope(action, "global-os")) continue;

      const hasOverride = action.id in overrides;
      const overriddenCombos = hasOverride ? overrides[action.id] ?? [] : [];
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
        const raw = await invoke<RawOutcome[]>("set_shortcuts", { requests });
        if (cancelled) return;
        const okCount = raw.filter((o) => o.succeeded).length;
        info(`reconcile: ${okCount}/${raw.length} registered`);
        for (const o of raw) {
          if (!o.succeeded) {
            warn(`reconcile: failed ${o.action} [${o.accel}]: ${o.error ?? "?"}`);
          }
        }
        const outcomes: RegistrationOutcome[] = raw.map((o) => ({
          action: o.action,
          accel: o.accel,
          succeeded: o.succeeded,
          fallback: o.fallback,
          error: o.error,
        }));
        dispatch({ type: "bindings.set-outcomes", outcomes });

        // Lockout rescue: if the window-toggle shortcut isn't registered
        // — for any reason, including the user explicitly unbinding it —
        // surface the main window so they can reach settings. An unbound
        // toggle + a hidden window is the one state we can't escape.
        const toggleOk = raw.some(
          (o) => o.action === "app.toggle-window" && o.succeeded
        );
        if (!toggleOk) {
          warn("reconcile: app.toggle-window not registered; presenting main");
          dispatch({ type: "present.set", window: "main" });
        }
      } catch (err) {
        logError(`reconcile: set_shortcuts invoke failed: ${err}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [overrides, hydrated, dispatch]);

  // Rust → JS: a registered combo fired. Resolve via the dispatch table.
  useEffect(() => {
    const unlistenP = listen<string>("shortcut:fired", (ev) => {
      const id = ev.payload as ActionId;
      info(`shortcut:fired received → ${id}`);
      const action = ACTIONS_BY_ID[id];
      if (!action) return;
      const reduced = resolveDispatch(action);
      if (reduced) dispatch(reduced);
    });
    return () => {
      unlistenP.then((u) => u()).catch(() => {});
    };
  }, [dispatch]);
}
