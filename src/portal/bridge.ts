/**
 * Tauri-side portal bridge. Manages a hidden WebviewWindow that
 * renders floating UI (menus, dropdowns) outside the main window.
 *
 * All Tauri imports are dynamic — this module is safe to import in
 * a browser build; the Tauri code paths are never reached.
 */

import type { ShowMenuRequest, PortalResponse } from "./types";
import type { PortalAPI } from "./context";

let portalReady = false;
let pendingResolve: ((id: string | null) => void) | null = null;
let cleanup: (() => void) | null = null;

export async function initPortalBridge(): Promise<PortalAPI> {
  if (!portalReady) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const { listen } = await import("@tauri-apps/api/event");

    // Create the portal window once — it stays hidden until needed.
    const existing = await WebviewWindow.getByLabel("portal");
    if (!existing) {
      new WebviewWindow("portal", {
        url: "/portal.html",
        transparent: true,
        decorations: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        visible: false,
        width: 1,
        height: 1,
        resizable: false,
        shadow: false,
        focus: false,
      });
    }

    // Listen for responses from the portal window.
    const unlistenResponse = await listen<PortalResponse>(
      "portal:response",
      (event) => {
        const r = event.payload;
        if (r.kind === "select") {
          pendingResolve?.(r.id);
        } else {
          pendingResolve?.(null);
        }
        pendingResolve = null;
      }
    );

    // If the portal window loses focus, treat it as a dismiss.
    const unlistenBlur = await listen("portal:blur", () => {
      pendingResolve?.(null);
      pendingResolve = null;
    });

    cleanup = () => {
      unlistenResponse();
      unlistenBlur();
    };

    portalReady = true;
  }

  return { showMenu };
}

async function showMenu(opts: {
  items: import("./types").PortalItem[];
  x: number;
  y: number;
  minWidth?: number;
}): Promise<string | null> {
  // Cancel any pending request.
  pendingResolve?.(null);

  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { emitTo } = await import("@tauri-apps/api/event");

  const mainWin = getCurrentWindow();
  const pos = await mainWin.outerPosition();
  const scale = await mainWin.scaleFactor();

  // Convert local viewport coords → screen coords (physical pixels).
  const request: ShowMenuRequest = {
    items: opts.items,
    screenX: pos.x + opts.x * scale,
    screenY: pos.y + opts.y * scale,
    minWidth: opts.minWidth,
  };

  // Send the request to the portal window. It will self-size, position,
  // show, and set focus. The response comes back via the event listener.
  const portal = await WebviewWindow.getByLabel("portal");
  if (!portal) throw new Error("Portal window not found");

  await emitTo("portal", "portal:show", request);

  return new Promise<string | null>((resolve) => {
    pendingResolve = resolve;
  });
}

/** True while a portal menu/dropdown is awaiting user interaction. */
export function isPortalActive(): boolean {
  return pendingResolve !== null;
}

export function teardownPortalBridge() {
  cleanup?.();
  cleanup = null;
  portalReady = false;
}
