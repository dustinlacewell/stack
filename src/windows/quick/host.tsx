/**
 * Quick-add window — its own webview, fixed 620×148. Receives a
 * `quick:show` snapshot of stacks + activeStackId, captures one task's
 * worth of text, and emits `quick:response` on commit/dismiss.
 *
 * Local state: `draft`, `selectedStackId`. Neither leaks to the main
 * reducer until the user commits.
 */

import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { StackId } from "../../types";
import { showMenu } from "../portal/client";
import type { QuickResponse, ShowQuickRequest } from "./types";
import "../../design/tokens.css";
import "./host.css";

function QuickHost() {
  const [snapshot, setSnapshot] = useState<ShowQuickRequest>({
    stacks: [],
    activeStackId: null,
  });
  const [draft, setDraft] = useState("");
  const [stackId, setStackIdState] = useState<StackId | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Take a fresh snapshot on every show. Re-seed local state so the user
  // doesn't reopen into a stale draft.
  useEffect(() => {
    const unlisten = listen<ShowQuickRequest>("quick:show", (event) => {
      setSnapshot(event.payload);
      setStackIdState(event.payload.activeStackId);
      setDraft("");
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  // While the portal is open *for us*, the OS reports quick as blurred —
  // but the user is still interacting with our menu. Suppress dismiss
  // until showMenu resolves.
  const portalOpenRef = useRef(false);

  const dismiss = () => {
    if (portalOpenRef.current) return;
    void respond({ kind: "dismiss" });
  };

  // Blur → dismiss.
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenTauri = win.onFocusChanged(({ payload: focused }) => {
      if (!focused) dismiss();
    });
    window.addEventListener("blur", dismiss);
    return () => {
      unlistenTauri.then((u) => u());
      window.removeEventListener("blur", dismiss);
    };
  }, []);

  const cycleStack = (dir: -1 | 1) => {
    const ss = snapshot.stacks;
    if (ss.length === 0) return;
    const idx = ss.findIndex((s) => s.id === stackId);
    const next = (idx + dir + ss.length) % ss.length;
    const id = ss[next].id;
    setStackIdState(id);
    void respond({ kind: "set-active-stack", stackId: id });
  };

  const commit = () => {
    void respond({ kind: "commit", text: draft, stackId });
  };

  const pickStack = async () => {
    if (snapshot.stacks.length === 0) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    portalOpenRef.current = true;
    try {
      const chosen = await showMenu({
        items: snapshot.stacks.map((s) => ({
          id: s.id,
          label: s.name || "Untitled",
        })),
        x: rect.left,
        y: rect.bottom,
        minWidth: rect.width,
        selectedId: stackId ?? undefined,
      });
      if (chosen) {
        setStackIdState(chosen);
        void respond({ kind: "set-active-stack", stackId: chosen });
      }
    } finally {
      portalOpenRef.current = false;
      // Return focus to ourselves — the portal stole it on open.
      try {
        const win = getCurrentWindow();
        await win.setFocus();
      } catch {}
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        commit();
        return;
      case "Escape":
        e.preventDefault();
        dismiss();
        return;
      case "ArrowUp":
        if (e.ctrlKey) {
          e.preventDefault();
          cycleStack(-1);
        }
        return;
      case "ArrowDown":
        if (e.ctrlKey) {
          e.preventDefault();
          cycleStack(1);
        }
        return;
    }
  };

  const active = snapshot.stacks.find((s) => s.id === stackId);
  const stackLabel = active
    ? active.name || "Untitled"
    : snapshot.stacks.length === 0
      ? "Todo (new)"
      : "Select…";

  return (
    <div className="quick">
      <div className="quick-row">
        <button
          ref={triggerRef}
          type="button"
          className={`quick-stack-trigger${
            snapshot.stacks.length === 0 ? " disabled" : ""
          }`}
          title="Target stack (Ctrl+↑/↓ cycles)"
          disabled={snapshot.stacks.length === 0}
          onClick={pickStack}
          tabIndex={-1}
        >
          <span className="quick-stack-label">{stackLabel}</span>
          <span className="quick-stack-caret" aria-hidden="true" />
        </button>
        <input
          ref={inputRef}
          className="quick-input"
          placeholder="Quick thought…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
        />
      </div>
    </div>
  );
}

async function respond(response: QuickResponse) {
  await emit("quick:response", response);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QuickHost />
  </React.StrictMode>
);
