import { useRef, useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MenuPortalContext } from "@app/design";

type Props = {
  styles: string;
  children: ReactNode;
  className?: string;
};

/**
 * Renders children inside a shadow DOM boundary with injected styles.
 * Prevents the host page's CSS (Tailwind) from leaking in and the
 * app's CSS from leaking out. Provides a MenuPortalContext so portaled
 * menus stay inside the shadow root instead of escaping to document.body.
 */
export function ShadowScope({ styles, children, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    setRoot(shadow);

    // Create a stable container div inside the shadow root for menu portals.
    let portalEl = shadow.querySelector<HTMLDivElement>(".portal-container");
    if (!portalEl) {
      portalEl = document.createElement("div");
      portalEl.className = "portal-container";
      portalEl.style.position = "absolute";
      portalEl.style.inset = "0";
      portalEl.style.pointerEvents = "none";
      shadow.appendChild(portalEl);
    }
    setContainer(portalEl);
  }, []);

  return (
    <div ref={hostRef} className={className} style={{ position: "relative" }}>
      {root &&
        createPortal(
          <>
            <style>{styles}</style>
            <MenuPortalContext.Provider value={container}>
              {children}
            </MenuPortalContext.Provider>
          </>,
          root,
        )}
    </div>
  );
}
