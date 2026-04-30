import { createContext } from "react";
import type { PortalItem } from "./types";

export type PortalAPI = {
  showMenu: (opts: {
    items: PortalItem[];
    x: number;
    y: number;
    minWidth?: number;
  }) => Promise<string | null>;
};

/**
 * When provided (Tauri desktop), Menu and StackSelect route floating UI
 * through a separate WebviewWindow that can paint outside the main
 * window's bounds. When null (browser / site), components fall back to
 * createPortal within the current DOM.
 */
export const PortalContext = createContext<PortalAPI | null>(null);
