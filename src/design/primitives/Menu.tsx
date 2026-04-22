import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./Menu.css";

type MenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
};

// Anchored context menu. Positions at (x, y), clamped to viewport.
// Closes on outside click, Escape, or any menu-item activation.
export function Menu({ x, y, onClose, children }: MenuProps) {
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
        {children}
      </div>
    </div>,
    document.body
  );
}

type ItemProps = {
  onSelect: () => void;
  danger?: boolean;
  children: ReactNode;
};

export function MenuItem({ onSelect, danger, children }: ItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item ${danger ? "danger" : ""}`}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-separator" role="separator" />;
}
