export type PortalItem =
  | { id: string; label: string; danger?: boolean; disabled?: boolean }
  | { separator: true };

export type ShowMenuRequest = {
  items: PortalItem[];
  screenX: number;
  screenY: number;
  minWidth?: number;
  // Item id rendered with the "active" mark. Also seeds the keyboard
  // cursor so arrow-key nav starts from the current selection.
  selectedId?: string;
};

// `requestId` correlates a show with its response, so a stale dismiss can't
// resolve a freshly-opened menu. The portal host echoes it back unchanged.
export type ShowMenuEnvelope = ShowMenuRequest & { requestId: string };
export type PortalResponseEnvelope = PortalResponse & { requestId: string };

export type PortalResponse =
  | { kind: "select"; id: string }
  | { kind: "dismiss" };

// Cross-window RPC. Child windows (quick, search, …) emit `portal:request`
// to ask main to open a menu on their behalf. Main calls its existing
// showMenu() and emitTos a `portal:response` envelope back to the
// originating window, which resolves the local promise.
//
// `from` lets main route the response. `requestId` correlates the round
// trip across windows.
export type PortalRpcRequest = {
  requestId: string;
  from: string;
  items: PortalItem[];
  screenX: number;
  screenY: number;
  minWidth?: number;
  selectedId?: string;
};
