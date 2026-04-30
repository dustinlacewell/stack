import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PortalContext } from "../../windows/portal/context";
import type { PortalItem } from "../../windows/portal/types";
import "./Menu.css";

/**
 * Portal container for menus in the browser. Defaults to `document.body`.
 * Provide a different element (e.g. a shadow root container) to keep
 * menus inside an encapsulated DOM subtree.
 */
export const MenuPortalContext = createContext<HTMLElement | null>(null);

export type MenuItemDef = PortalItem;

type MenuProps = {
  x: number;
  y: number;
  items: MenuItemDef[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

/**
 * Anchored context menu. Data-driven: takes an items array.
 *
 * In Tauri: delegates to the portal window (separate WebviewWindow) so
 * the menu can paint outside the main window's bounds.
 *
 * In the browser / site: renders via createPortal into the nearest
 * MenuPortalContext container (or document.body).
 */
export function Menu({ x, y, items, onSelect, onClose }: MenuProps) {
  const portal = useContext(PortalContext);

  // --- Tauri path: delegate to the portal window ---
  useEffect(() => {
    if (!portal) return;
    let cancelled = false;
    portal.showMenu({ items, x, y }).then((id) => {
      if (cancelled) return;
      if (id) onSelect(id);
      onClose();
    });
    return () => {
      cancelled = true;
    };
    // Run once on mount — the menu is conditionally rendered, so mount
    // IS the trigger. Don't re-fire on prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (portal) return null;

  // --- Browser path: render locally ---
  return <BrowserMenu x={x} y={y} items={items} onSelect={onSelect} onClose={onClose} />;
}

/** Browser/site fallback — createPortal into the DOM. */
function BrowserMenu({ x, y, items, onSelect, onClose }: MenuProps) {
  const portalContainer = useContext(MenuPortalContext) ?? document.body;
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 4;
    const maxY = window.innerHeight - rect.height - 4;
    setPos({
      x: Math.min(Math.max(4, x), Math.max(4, maxX)),
      y: Math.min(Math.max(4, y), Math.max(4, maxY)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  return createPortal(
    <div
      className="menu-scrim"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        className="menu"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={(e) => e.stopPropagation()}
        role="menu"
      >
        {items.map((item, i) => {
          if ("separator" in item && item.separator) {
            return <div key={`sep-${i}`} className="menu-separator" role="separator" />;
          }
          const it = item as Extract<MenuItemDef, { id: string }>;
          return (
            <button
              key={it.id}
              type="button"
              role="menuitem"
              className={`menu-item${it.danger ? " danger" : ""}`}
              onClick={() => {
                onSelect(it.id);
                onClose();
              }}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>,
    portalContainer,
  );
}
