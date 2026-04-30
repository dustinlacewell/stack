/**
 * Portal window — a tiny React app that renders menus/dropdowns in a
 * separate transparent WebviewWindow. Listens for requests from the
 * main window via Tauri events, self-sizes, and sends back selections.
 */

import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import type {
  PortalItem,
  PortalResponse,
  ShowMenuEnvelope,
  ShowMenuRequest,
} from "./types";
import "../../design/tokens.css";
import "./host.css";

function PortalHost() {
  const [request, setRequest] = useState<ShowMenuRequest | null>(null);
  const requestIdRef = useRef<string | null>(null);

  // Listen for show requests from the main window.
  useEffect(() => {
    const unlisten = listen<ShowMenuEnvelope>("portal:show", (event) => {
      const { requestId, ...rest } = event.payload;
      requestIdRef.current = requestId;
      setRequest(rest);
    });
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  // After rendering, measure content, resize + position + show the window.
  //
  // The portal window starts at 1×1 (hidden). Content can't lay out in a
  // 1×1 viewport, so we first expand the window offscreen to a generous
  // size, wait for layout, measure the actual content, then shrink-to-fit
  // and position at the requested screen coordinates.
  useEffect(() => {
    if (!request) return;
    const win = getCurrentWindow();
    const PAD = 4;

    let cancelled = false;
    (async () => {
      const scale = await win.scaleFactor();

      // 1. Move offscreen and expand so content can lay out freely.
      await win.setPosition(new LogicalPosition(-2000, -2000));
      await win.setSize(new LogicalSize(600, 600));

      // 2. Wait two frames so the browser fully lays out the new content.
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      );
      if (cancelled) return;

      // 3. Measure the actual content size. Use scrollWidth/scrollHeight
      //    on the document element — this captures the full content extent
      //    regardless of CSS box model differences between the menu div
      //    and the viewport.
      const docW = document.documentElement.scrollWidth;
      const docH = document.documentElement.scrollHeight;

      // 4. Compute final position. Request coords are physical screen
      //    pixels; LogicalPosition wants logical, so divide by scale.
      let x = request.screenX / scale;
      let y = request.screenY / scale;

      // Clamp to screen edges (best-effort; multi-monitor is hard).
      const screenW = window.screen.availWidth;
      const screenH = window.screen.availHeight;
      if (x + docW > screenW - PAD) x = screenW - PAD - docW;
      if (y + docH > screenH - PAD) y = screenH - PAD - docH;
      if (x < PAD) x = PAD;
      if (y < PAD) y = PAD;

      // 5. Add margin for box-shadow overflow, then position and reveal.
      //    The extra space is transparent + click-through (see below).
      const SHADOW = 16;
      const finalW = docW + SHADOW * 2;
      const finalH = docH + SHADOW * 2;
      await win.setSize(new LogicalSize(finalW, finalH));
      await win.setPosition(new LogicalPosition(x - SHADOW, y - SHADOW));
      // Make the transparent padding click-through. The menu div
      // re-enables cursor events on mouseenter (see render below).
      await win.setIgnoreCursorEvents(true);
      await win.show();
      await win.setFocus();
    })();

    return () => { cancelled = true; };
  }, [request]);

  // Dismiss / select pair. Both emit a response envelope and clear local
  // state — the main-side reducer closes its `aux` slot, and the main-side
  // reconciler hides the OS window. The host doesn't touch window
  // visibility; that lives at the reconciler layer.
  const finish = (response: PortalResponse) => {
    const id = requestIdRef.current;
    if (!id) return;
    requestIdRef.current = null;
    setRequest(null);
    void respond(id, response);
  };

  // Blur → dismiss. Use both Tauri's onFocusChanged and the browser's
  // "blur" event as a belt-and-suspenders approach — transparent,
  // always-on-top windows on some platforms don't reliably fire one or
  // the other.
  useEffect(() => {
    if (!request) return;
    const win = getCurrentWindow();
    const dismiss = () => finish({ kind: "dismiss" });

    const unlistenTauri = win.onFocusChanged(({ payload: focused }) => {
      if (!focused) dismiss();
    });
    window.addEventListener("blur", dismiss);

    return () => {
      unlistenTauri.then((u) => u());
      window.removeEventListener("blur", dismiss);
    };
  }, [request]);

  // Escape → dismiss.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish({ kind: "dismiss" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!request) return null;

  return (
    <div
      className="portal-menu"
      style={{ minWidth: request.minWidth ?? 160, margin: 16 }}
      role="menu"
      onMouseEnter={() => getCurrentWindow().setIgnoreCursorEvents(false)}
      onMouseLeave={() => getCurrentWindow().setIgnoreCursorEvents(true)}
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
            onClick={() => !it.disabled && finish({ kind: "select", id: it.id })}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// Emit only — visibility and main-window focus are owned by the main-side
// reconcilers, driven from the reducer's aux state.
async function respond(requestId: string, response: PortalResponse) {
  await emit("portal:response", { requestId, ...response });
}

// Mount.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PortalHost />
  </React.StrictMode>
);
