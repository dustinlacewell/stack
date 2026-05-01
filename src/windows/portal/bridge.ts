/**
 * Portal bridge — owns the showMenu() Promise contract used by call sites
 * (Menu, StackSelect). The window itself is created and reconciled by the
 * window manager; this module only:
 *
 *   - mints a requestId and dispatches `portal.open` with the request,
 *   - awaits the matching `portal:response` envelope and resolves the
 *     promise with the chosen item id (or null on dismiss).
 *
 * Stale-id mismatches resolve the promise to null — a cancelled request
 * is indistinguishable from a dismiss to the caller.
 */

import type {
  PortalItem,
  PortalResponseEnvelope,
  PortalRpcRequest,
} from "./types";
import type { PortalAPI } from "./context";
import type { ReducerAction } from "../../reducer";

type Pending = (id: string | null) => void;

const pending = new Map<string, Pending>();
let initialized = false;
let dispatchHandle: ((a: ReducerAction) => void) | null = null;
let getMainWinPos: (() => Promise<{ x: number; y: number; scale: number }>)
  | null = null;

export type InitOptions = {
  dispatch: (action: ReducerAction) => void;
};

export async function initPortalBridge(opts: InitOptions): Promise<PortalAPI> {
  dispatchHandle = opts.dispatch;

  if (!initialized) {
    initialized = true;

    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const { listen, emitTo } = await import("@tauri-apps/api/event");

    const mainWin = getCurrentWindow();
    getMainWinPos = async () => {
      const pos = await mainWin.outerPosition();
      const scale = await mainWin.scaleFactor();
      return { x: pos.x, y: pos.y, scale };
    };

    // Resolve local showMenu() promises. The portal host emits
    // "portal:response" globally; we filter by requestId to match.
    await listen<PortalResponseEnvelope>("portal:response", (event) => {
      const { requestId } = event.payload;
      const resolver = pending.get(requestId);
      if (!resolver) return;
      pending.delete(requestId);
      resolver(event.payload.kind === "select" ? event.payload.id : null);
    });

    // Cross-window RPC relay. Child windows emit "portal:request" with
    // pre-translated screen coords + items + the originating window's
    // label. We open the portal on their behalf, await the result, and
    // emit it back as "portal:response" addressed to that window.
    await listen<PortalRpcRequest>("portal:request", (event) => {
      const { requestId, from, items, screenX, screenY, minWidth, selectedId } =
        event.payload;
      const id = bridgeRequestId();
      pending.set(id, (chosen) => {
        const response: PortalResponseEnvelope =
          chosen !== null
            ? { kind: "select", id: chosen, requestId }
            : { kind: "dismiss", requestId };
        void emitTo(from, "portal:response", response);
      });
      opts.dispatch({
        type: "portal.open",
        request: { items, screenX, screenY, minWidth, selectedId },
        requestId: id,
      });
    });
  }

  return { showMenu };
}

async function showMenu(opts: {
  items: PortalItem[];
  x: number;
  y: number;
  minWidth?: number;
  selectedId?: string;
}): Promise<string | null> {
  if (!dispatchHandle || !getMainWinPos) {
    throw new Error("Portal bridge not initialized");
  }

  // Translate viewport coords → screen coords here, at the call boundary.
  const { x: winX, y: winY, scale } = await getMainWinPos();
  const request = {
    items: opts.items,
    screenX: winX + opts.x * scale,
    screenY: winY + opts.y * scale,
    minWidth: opts.minWidth,
    selectedId: opts.selectedId,
  };

  return new Promise<string | null>((resolve) => {
    const requestId = bridgeRequestId();
    pending.set(requestId, resolve);
    dispatchHandle!({ type: "portal.open", request, requestId });
  });
}

let seq = 0;
function bridgeRequestId(): string {
  seq += 1;
  return `portal-${Date.now().toString(36)}-${seq}`;
}
