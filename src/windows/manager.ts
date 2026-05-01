/**
 * Window manager — one specification per auxiliary OS window, one
 * reconciler that drives them all from reducer state.
 *
 * Each window is described by a {@link WindowSpec}: how to compute its
 * desired state from the app state, and how to translate its response
 * events back into reducer actions. The manager owns:
 *
 *   - one-time creation of the underlying WebviewWindow (lazy, hidden)
 *   - subscription to "<label>:response" events, piped to dispatch
 *   - show/hide reconciliation: each tick, every spec maps state to an
 *     intended visibility + payload, and the manager makes the OS match
 *
 * Every spec is purely declarative. Adding a new auxiliary window =
 * adding one entry to the WINDOWS array. No bespoke effects, no ambient
 * "is X active" flags.
 */

import type { ReducerAction } from "../reducer";

// Tauri's WebviewWindowOptions is wide; we only need a subset and type
// it loosely so this module stays free of Tauri imports at the type
// level (the actual import happens inside init).
export type WebviewOptions = Record<string, unknown>;

// Desired state for a window on a given tick. Returning `null` means
// "not visible right now"; returning a payload means "visible, with
// this data."
export type DesiredVisibility<Show> =
  | { visible: false }
  | { visible: true; payload: Show };

export type WindowSpec<State, Show, Response> = {
  /** Stable Tauri window label and event-channel prefix. */
  label: string;
  /** URL the webview loads. */
  url: string;
  /** Tauri WebviewWindow constructor options (size, transparent, …). */
  options: WebviewOptions;
  /**
   * Map app state to a desired visibility. Called every tick. The manager
   * shows / hides the window and re-emits the show payload whenever
   * `payload` (deep-equal-ish; we just JSON-stringify) changes.
   */
  desired: (state: State) => DesiredVisibility<Show>;
  /**
   * Translate a response event from the window's host into a reducer
   * action (or `null` to ignore).
   */
  onResponse: (response: Response) => ReducerAction | null;
  /**
   * If true, the manager only emits the show payload and hides the
   * window when state demands — but does NOT call `win.show()`. The host
   * is responsible for revealing itself (e.g. after self-sizing). The
   * portal needs this: it measures content offscreen, then shows.
   */
  selfShows?: boolean;
};

type AnySpec = WindowSpec<unknown, unknown, unknown>;

type SpecRuntime = {
  spec: AnySpec;
  lastVisible: boolean;
  lastPayloadKey: string | null;
};

export type WindowManager<State> = {
  reconcile: (state: State) => Promise<void>;
};

export async function createWindowManager<State>(
  specs: WindowSpec<State, any, any>[],
  dispatch: (action: ReducerAction) => void
): Promise<WindowManager<State>> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const { listen } = await import("@tauri-apps/api/event");

  const runtimes: SpecRuntime[] = [];

  for (const spec of specs as AnySpec[]) {
    // Ensure the webview exists exactly once. HMR can re-run this whole
    // module in dev; getByLabel guards against double-create.
    const existing = await WebviewWindow.getByLabel(spec.label);
    if (!existing) {
      // The constructor side-effects creation. `new` without using the
      // value is correct here — the window is identified by label.
      new WebviewWindow(spec.label, {
        ...(spec.options as WebviewOptions),
        url: spec.url,
        visible: false,
      } as never);
    }

    await listen<unknown>(`${spec.label}:response`, (event) => {
      const action = spec.onResponse(event.payload);
      if (action) dispatch(action);
    });

    runtimes.push({ spec, lastVisible: false, lastPayloadKey: null });
  }

  const reconcile = async (state: State): Promise<void> => {
    const { emitTo } = await import("@tauri-apps/api/event");

    for (const rt of runtimes) {
      const desired = (rt.spec as WindowSpec<State, any, any>).desired(state);
      const win = await WebviewWindow.getByLabel(rt.spec.label);
      if (!win) continue;

      if (desired.visible) {
        // Re-emit show payload whenever it changes (or on first show).
        // JSON identity is good enough — payloads are small snapshots.
        const key = JSON.stringify(desired.payload);
        if (key !== rt.lastPayloadKey) {
          await emitTo(rt.spec.label, `${rt.spec.label}:show`, desired.payload);
          rt.lastPayloadKey = key;
        }
        // For fixed-size palettes, re-pin to the spec's dimensions every
        // reconcile pass. The constructor takes these same numbers, but
        // Tauri can apply them as physical pixels under DPI scaling and
        // we want logical. Re-asserting on every pass also makes Vite HMR
        // pick up height/width edits in the spec without restarting tauri.
        const resizable = rt.spec.options.resizable !== false;
        const w = rt.spec.options.width as number | undefined;
        const h = rt.spec.options.height as number | undefined;
        if (!resizable && typeof w === "number" && typeof h === "number") {
          const { LogicalSize } = await import("@tauri-apps/api/dpi");
          const size = new LogicalSize(w, h);
          await win.setMinSize(null);
          await win.setMaxSize(null);
          await win.setSize(size);
          await win.setMinSize(size);
          await win.setMaxSize(size);
        }
        if (!rt.lastVisible && !rt.spec.selfShows) {
          if (!resizable) await win.center();
          await win.show();
          await win.setFocus();
        }
        rt.lastVisible = true;
      } else if (rt.lastVisible) {
        await win.hide();
        rt.lastVisible = false;
        rt.lastPayloadKey = null;
      }
    }
  };

  return { reconcile };
}
