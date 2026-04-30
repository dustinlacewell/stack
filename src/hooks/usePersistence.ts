/**
 * Two-way persistence for AppState. On mount: load from disk and dispatch
 * hydrate actions. After hydration: every state change writes back to disk.
 *
 * `hydrated` is exposed so dependents (OS-shortcut sync, midnight reset)
 * can wait until the load is complete before observing state.
 */

import { useEffect, useState } from "react";
import { info, warn } from "@tauri-apps/plugin-log";
import { normalizeOverrides } from "../actions";
import {
  loadBindings,
  loadState,
  saveBindings,
  saveState,
} from "../storage";
import type { ReducerAction } from "../reducer";
import type { AppState } from "../types";

export function usePersistence(opts: {
  state: AppState;
  dispatch: (action: ReducerAction) => void;
  todayKey: string;
}): { hydrated: boolean } {
  const { state, dispatch, todayKey } = opts;
  const [hydrated, setHydrated] = useState(false);

  // Load.
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
          // Catch up on midnight boundaries crossed while offline.
          dispatch({ type: "habits.reset-if-stale", today: todayKey });
        }
        dispatch({
          type: "bindings.hydrate",
          overrides: normalizeOverrides(persistedBindings),
        });
      } catch (err) {
        warn(`hydration: failed: ${err}`);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // todayKey is captured at hook-start; we don't want to re-run on date
    // changes (the midnight scheduler handles that separately).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Save state on every state change post-hydration.
  useEffect(() => {
    if (!hydrated) return;
    saveState(state);
  }, [state, hydrated]);

  // Save bindings (specifically) when overrides change. We could just save
  // the whole state object on every change, but bindings live under their
  // own store key — keeping them split lets a corrupt-bindings file recover
  // without taking the whole stack down with it.
  useEffect(() => {
    if (!hydrated) return;
    saveBindings(state.overrides);
  }, [state.overrides, hydrated]);

  return { hydrated };
}
