/**
 * Window-level keyboard dispatcher for the main window. Watches for
 * keydown events, resolves the active scope from current state, and fires
 * the matching reducer action via a single data-driven dispatch table.
 *
 * Listening on `window` (not the root element) decouples shortcuts from
 * DOM focus — after a titlebar drag or stray focus shift, Escape / etc.
 * still reach us. Inputs that own a key (EditingInput, Settings recorder)
 * call stopPropagation; their handlers run first on the actual target.
 */

import { useEffect } from "react";
import {
  ACTIONS,
  actionInScope,
  getBindings,
  resolveDispatch,
  type BindingOverrides,
  type Scope,
} from "../actions";
import { combosEqual, eventToCombo } from "../keys";
import type { ReducerAction } from "../reducer";
import type { AppState } from "../types";

function resolveScope(s: AppState): Scope {
  if (s.confirming) return "modal";
  if (s.editing) return "edit";
  return "list";
}

export function useKeyboardDispatcher(opts: {
  stateRef: React.MutableRefObject<AppState>;
  overridesRef: React.MutableRefObject<BindingOverrides>;
  dispatch: (action: ReducerAction) => void;
}): void {
  const { stateRef, overridesRef, dispatch } = opts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const combo = eventToCombo(e);
      const scope = resolveScope(stateRef.current);
      const chain: Scope[] = [scope, "global"];
      for (const sc of chain) {
        for (const action of ACTIONS) {
          if (!actionInScope(action, sc)) continue;
          const bindings = getBindings(action.id, overridesRef.current);
          if (!bindings.some((b) => combosEqual(b, combo))) continue;
          e.preventDefault();
          const reduced = resolveDispatch(action);
          if (reduced) dispatch(reduced);
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stateRef, overridesRef, dispatch]);
}
