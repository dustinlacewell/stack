/**
 * Cross-window portal client. Any child window (quick, search, …) imports
 * this to get a `showMenu()` function with the same shape as PortalAPI.
 *
 * Wire:
 *   1. Translate viewport coords → screen coords using *this* window's
 *      outerPosition + scaleFactor.
 *   2. Mint a requestId, install a one-shot resolver, emit "portal:request"
 *      to main with the originating window's label.
 *   3. Main's relay opens the portal, then emitTo's back "portal:response"
 *      addressed to this window. We filter by requestId and resolve.
 *
 * Stale-id mismatches are dropped silently — they belong to a different
 * caller's pending request.
 */

import type { PortalItem, PortalResponseEnvelope, PortalRpcRequest } from "./types";

type Pending = (id: string | null) => void;

const pending = new Map<string, Pending>();
let initialized = false;
let label: string | null = null;
let getOwnPos:
  | (() => Promise<{ x: number; y: number; scale: number }>)
  | null = null;

async function init(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { listen } = await import("@tauri-apps/api/event");

  const win = getCurrentWindow();
  label = win.label;
  getOwnPos = async () => {
    const pos = await win.outerPosition();
    const scale = await win.scaleFactor();
    return { x: pos.x, y: pos.y, scale };
  };

  await listen<PortalResponseEnvelope>("portal:response", (event) => {
    const { requestId } = event.payload;
    const resolver = pending.get(requestId);
    if (!resolver) return;
    pending.delete(requestId);
    resolver(event.payload.kind === "select" ? event.payload.id : null);
  });
}

export async function showMenu(opts: {
  items: PortalItem[];
  x: number;
  y: number;
  minWidth?: number;
  selectedId?: string;
}): Promise<string | null> {
  await init();
  if (!label || !getOwnPos) throw new Error("Portal client not initialized");

  const { emitTo } = await import("@tauri-apps/api/event");
  const { x: winX, y: winY, scale } = await getOwnPos();

  const requestId = nextRequestId();
  const request: PortalRpcRequest = {
    requestId,
    from: label,
    items: opts.items,
    screenX: winX + opts.x * scale,
    screenY: winY + opts.y * scale,
    minWidth: opts.minWidth,
    selectedId: opts.selectedId,
  };

  return new Promise<string | null>((resolve) => {
    pending.set(requestId, resolve);
    void emitTo("main", "portal:request", request);
  });
}

let seq = 0;
function nextRequestId(): string {
  seq += 1;
  return `portal-rpc-${Date.now().toString(36)}-${seq}`;
}
