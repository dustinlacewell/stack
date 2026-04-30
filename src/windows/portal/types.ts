export type PortalItem =
  | { id: string; label: string; danger?: boolean; disabled?: boolean }
  | { separator: true };

export type ShowMenuRequest = {
  items: PortalItem[];
  screenX: number;
  screenY: number;
  minWidth?: number;
};

// `requestId` correlates a show with its response, so a stale dismiss can't
// resolve a freshly-opened menu. The host echoes it back unchanged.
export type ShowMenuEnvelope = ShowMenuRequest & { requestId: string };
export type PortalResponseEnvelope = PortalResponse & { requestId: string };

export type PortalResponse =
  | { kind: "select"; id: string }
  | { kind: "dismiss" };
