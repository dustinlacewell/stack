export type PortalItem =
  | { id: string; label: string; danger?: boolean; disabled?: boolean }
  | { separator: true };

export type ShowMenuRequest = {
  items: PortalItem[];
  screenX: number;
  screenY: number;
  minWidth?: number;
};

export type PortalResponse =
  | { kind: "select"; id: string }
  | { kind: "dismiss" };
