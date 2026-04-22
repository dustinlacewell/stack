import { useRef, useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  styles: string;
  children: ReactNode;
  className?: string;
};

/**
 * Renders children inside a shadow DOM boundary with injected styles.
 * Prevents the host page's CSS (Tailwind) from leaking in and the
 * app's CSS from leaking out.
 */
export function ShadowScope({ styles, children, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    if (el.shadowRoot) {
      setRoot(el.shadowRoot);
      return;
    }
    setRoot(el.attachShadow({ mode: "open" }));
  }, []);

  return (
    <div ref={hostRef} className={className}>
      {root &&
        createPortal(
          <>
            <style>{styles}</style>
            {children}
          </>,
          root,
        )}
    </div>
  );
}
