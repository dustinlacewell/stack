/**
 * Blur-to-hide for the *main* window. When the main webview loses focus
 * to anything outside our app's windows, hide it after a short grace
 * window (so a quick refocus doesn't flicker).
 *
 * Suppression rules (none of these should auto-hide):
 *   - the user pinned the window
 *   - a confirm modal is open
 *   - a portal menu is open (focus stolen by the overlay)
 *   - the currently presented window isn't `main` — quick / search /
 *     settings have their own dismissal logic
 */

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppState } from "../types";
import type { ReducerAction } from "../reducer";

const GRACE_MS = 180;

function shouldSuppressHide(s: AppState): boolean {
  if (s.pinned) return true;
  if (s.confirming !== null) return true;
  if (s.portal !== null) return true;
  if (s.presented !== "main") return true;
  return false;
}

export function useBlurToHide(opts: {
  stateRef: React.MutableRefObject<AppState>;
  dispatch: (action: ReducerAction) => void;
}): void {
  const { stateRef, dispatch } = opts;

  useEffect(() => {
    let unlistenBlur: (() => void) | null = null;
    let hideTimer: number | null = null;
    const win = getCurrentWindow();

    const scheduleHide = () => {
      if (shouldSuppressHide(stateRef.current)) return;
      if (hideTimer !== null) clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        if (shouldSuppressHide(stateRef.current)) return;
        dispatch({ type: "present.set", window: null });
      }, GRACE_MS);
    };

    (async () => {
      unlistenBlur = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          if (hideTimer !== null) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }
          return;
        }
        scheduleHide();
      });
    })();

    return () => {
      if (hideTimer !== null) clearTimeout(hideTimer);
      unlistenBlur?.();
    };
  }, [stateRef, dispatch]);
}
