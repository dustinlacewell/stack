/**
 * Portal window — a tiny React app that renders menus/dropdowns in a
 * separate transparent WebviewWindow. Listens for requests from the
 * main window via Tauri events, self-sizes, and sends back selections.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import type { ShowMenuRequest, PortalItem, PortalResponse } from "./types";
import "../design/tokens.css";
import "./host.css";

function PortalHost() {
  const [request, setRequest] = useState<ShowMenuRequest | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Listen for show requests from the main window.
  useEffect(() => {
    const unlisten = listen<ShowMenuRequest>("portal:show", (event) => {
      setRequest(event.payload);
    });
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  // After rendering, measure content, resize + position + show the window.
  useLayoutEffect(() => {
    if (!request || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    const win = getCurrentWindow();
    const PAD = 4; // viewport-edge padding

    (async () => {
      const scale = await win.scaleFactor();
      const w = Math.ceil(rect.width) + 2; // +2 for subpixel safety
      const h = Math.ceil(rect.height) + 2;

      // Compute position. The request coords are in physical screen pixels;
      // LogicalPosition wants logical, so divide by scale.
      let x = request.screenX / scale;
      let y = request.screenY / scale;

      // Clamp to screen edges (best-effort; multi-monitor is hard).
      const screenW = window.screen.availWidth;
      const screenH = window.screen.availHeight;
      if (x + w > screenW - PAD) x = screenW - PAD - w;
      if (y + h > screenH - PAD) y = screenH - PAD - h;
      if (x < PAD) x = PAD;
      if (y < PAD) y = PAD;

      await win.setSize(new LogicalSize(w, h));
      await win.setPosition(new LogicalPosition(x, y));
      await win.show();
      await win.setFocus();
    })();
  }, [request]);

  // Blur → dismiss.
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (!focused && request) {
        respond({ kind: "dismiss" });
        setRequest(null);
      }
    });
    return () => {
      unlisten.then((u) => u());
    };
  }, [request]);

  // Escape → dismiss.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        respond({ kind: "dismiss" });
        setRequest(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!request) return null;

  const select = (id: string) => {
    respond({ kind: "select", id });
    setRequest(null);
  };

  return (
    <div
      ref={menuRef}
      className="portal-menu"
      style={{ minWidth: request.minWidth ?? 160 }}
      role="menu"
    >
      {request.items.map((item, i) => {
        if ("separator" in item && item.separator) {
          return <div key={`sep-${i}`} className="portal-separator" />;
        }
        const it = item as Extract<PortalItem, { id: string }>;
        const classes = ["portal-item"];
        if (it.danger) classes.push("danger");
        if (it.disabled) classes.push("disabled");
        return (
          <button
            key={it.id}
            className={classes.join(" ")}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => !it.disabled && select(it.id)}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

async function respond(r: PortalResponse) {
  const win = getCurrentWindow();
  await emit("portal:response", r);
  await win.hide();
}

// Mount.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PortalHost />
  </React.StrictMode>
);
