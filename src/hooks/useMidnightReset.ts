/**
 * Habit midnight reset scheduler. Two paths:
 *
 *   1. A `setTimeout` that fires at the next local midnight, then
 *      reschedules from `now` so sleep/wake doesn't drift it.
 *   2. A focus-change listener: every time the main window gains focus,
 *      we re-check whether today's date matches `lastHabitResetDate`. The
 *      reducer no-ops when they match, so this is cheap to call redundantly.
 *
 * Together they cover restarts, suspend/resume, and timezone changes.
 */

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ReducerAction } from "../reducer";

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 50); // +50ms slack so the timer fires after midnight
  return next.getTime() - now.getTime();
}

export function useMidnightReset(opts: {
  hydrated: boolean;
  dispatch: (action: ReducerAction) => void;
}): void {
  const { hydrated, dispatch } = opts;

  // Scheduled timer.
  useEffect(() => {
    if (!hydrated) return;
    let timer: number | null = null;
    const schedule = () => {
      timer = window.setTimeout(() => {
        dispatch({
          type: "habits.reset-if-stale",
          today: localDateKey(new Date()),
        });
        schedule();
      }, msUntilNextLocalMidnight(new Date()));
    };
    schedule();
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [hydrated, dispatch]);

  // Focus-driven catch-up.
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
  }, [dispatch]);
}

export const __testing = { localDateKey, msUntilNextLocalMidnight };
