import { useSyncExternalStore } from "react";
import { reducer } from "@app/reducer";
import type { AppState } from "@app/types";
import type { ReducerAction } from "@app/reducer";
import { fixtureState } from "./fixture";

// Module-level singleton. Vite deduplicates shared imports into a common
// chunk, so every Astro island that imports this module shares the same
// instance — StackViewDemo and QuickViewDemo see the same stacks.
//
// View starts as "quick" so the quick-add reducer path works. StackView
// never reads state.view, so this is invisible to it.
let state: AppState = (() => {
  const s = fixtureState();
  return { ...s, view: { kind: "quick" as const, draft: "" } };
})();

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function dispatch(action: ReducerAction): void {
  state = reducer(state, action);
  emit();
}

export function getSnapshot(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribe to the shared demo state from any React island. */
export function useDemoState(): AppState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
