import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useContext,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import type { Stack, StackId } from "../types";
import { MenuPortalContext } from "../design";
import { PortalContext } from "../windows/portal/context";
import "./StackSelect.css";

type Props = {
  stacks: Stack[];
  activeStackId: StackId | null;
  disabled?: boolean;
  onChange: (stackId: StackId) => void;
};

/**
 * Custom dropdown for stack picking.
 *
 * In Tauri: delegates to the portal window so the dropdown can paint
 * outside the main window's bounds (critical for the 148px QuickView).
 *
 * In the browser/site: renders the dropdown via createPortal, positioned
 * with fixed coords computed from the trigger's bounding rect.
 */
export function StackSelect({
  stacks,
  activeStackId,
  disabled,
  onChange,
}: Props) {
  const portal = useContext(PortalContext);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [browserOpen, setBrowserOpen] = useState(false);

  const active = stacks.find((s) => s.id === activeStackId);
  const label = active
    ? active.name || "Untitled"
    : stacks.length === 0
      ? "Todo (new)"
      : "Select…";

  const handleClick = useCallback(async () => {
    if (disabled || stacks.length === 0) return;

    if (portal) {
      // Tauri path: use the portal window.
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const id = await portal.showMenu({
        items: stacks.map((s) => ({
          id: s.id,
          label: s.name || "Untitled",
        })),
        x: rect.left,
        y: rect.bottom,
        minWidth: rect.width,
        selectedId: activeStackId ?? undefined,
      });
      if (id) onChange(id);
    } else {
      // Browser path: toggle local dropdown.
      setBrowserOpen((o) => !o);
    }
  }, [portal, stacks, disabled, onChange]);

  return (
    <div className={`stack-select${disabled ? " disabled" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="stack-select-trigger"
        onClick={handleClick}
        tabIndex={-1}
        title="Target stack (Ctrl+↑/↓ cycles)"
        disabled={disabled}
      >
        <span className="stack-select-label">{label}</span>
        <span className="stack-select-caret" aria-hidden="true" />
      </button>
      {browserOpen && !portal && (
        <BrowserDropdown
          stacks={stacks}
          activeStackId={activeStackId}
          triggerRef={triggerRef}
          onSelect={(id) => {
            onChange(id);
            setBrowserOpen(false);
          }}
          onClose={() => setBrowserOpen(false)}
        />
      )}
    </div>
  );
}

/** Browser/site fallback — portaled dropdown. */
function BrowserDropdown({
  stacks,
  activeStackId,
  triggerRef,
  onSelect,
  onClose,
}: {
  stacks: Stack[];
  activeStackId: StackId | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (id: StackId) => void;
  onClose: () => void;
}) {
  const portalContainer = useContext(MenuPortalContext) ?? document.body;
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const menuH = menu?.getBoundingClientRect().height ?? 200;
    const openUp = spaceBelow < menuH && spaceAbove > spaceBelow;
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [triggerRef]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, triggerRef]);

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
    <ul
      ref={menuRef}
      className="stack-select-menu"
      style={menuStyle}
      role="listbox"
    >
      {stacks.map((s) => (
        <li
          key={s.id}
          className={`stack-select-option${s.id === activeStackId ? " active" : ""}`}
          role="option"
          aria-selected={s.id === activeStackId}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(s.id);
          }}
        >
          {s.name || "Untitled"}
        </li>
      ))}
    </ul>,
    portalContainer,
  );
}
