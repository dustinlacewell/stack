/**
 * Main-window reconciler. The main window hosts the stack view and
 * nothing else — quick / search / settings each have their own webview.
 *
 *   - When `state.presented === "main"`, ensure the main window is
 *     visible at the user's remembered size (or the default).
 *   - Otherwise, hide it.
 *
 * Also wires the native resize handle: while main is visible, listen for
 * `tauri://resize`, debounce, and persist the new dimensions to state.
 */

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { error as logError } from "@tauri-apps/plugin-log";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { AppState, WindowSize } from "../types";
import type { ReducerAction } from "../reducer";

const DEFAULT_STACK_SIZE: WindowSize = { w: 480, h: 360 };
const RESIZABLE_MIN: WindowSize = { w: 360, h: 320 };

export function useMainWindow(opts: {
  state: AppState;
  stateRef: React.MutableRefObject<AppState>;
  dispatch: (action: ReducerAction) => void;
}): void {
  const { state, stateRef, dispatch } = opts;

  // Show / hide reconciler.
  useEffect(() => {
    const win = getCurrentWindow();
    const want = state.presented === "main";
    const size = state.stackViewSize ?? DEFAULT_STACK_SIZE;
    (async () => {
      try {
        const isVisible = await win.isVisible();
        if (want && !isVisible) {
          await win.setMinSize(
            new LogicalSize(RESIZABLE_MIN.w, RESIZABLE_MIN.h)
          );
          await win.setSize(new LogicalSize(size.w, size.h));
          await win.setResizable(true);
          await invoke("show_stack");
        } else if (!want && isVisible) {
          await win.hide();
        }
      } catch (err) {
        logError(`main reconcile failed: ${err}`);
      }
    })();
  }, [state.presented, state.stackViewSize]);

  // Persist user-driven resize.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let timer: number | null = null;
    const win = getCurrentWindow();
    (async () => {
      unlisten = await win.onResized(({ payload }) => {
        if (stateRef.current.presented !== "main") return;
        // Convert physical → logical via scale factor; debounce so rapid
        // drag events don't thrash the reducer.
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
  }, [stateRef, dispatch]);
}
