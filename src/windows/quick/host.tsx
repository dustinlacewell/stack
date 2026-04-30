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

  const dismiss = () => respond({ kind: "dismiss" });

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
        <div
          className={`quick-stack-indicator${
            snapshot.stacks.length === 0 ? " disabled" : ""
          }`}
          title="Target stack (Ctrl+↑/↓ cycles)"
        >
          {stackLabel}
        </div>
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
      <div className="quick-hint">
        Enter save · Esc dismiss · Ctrl+↑↓ change stack
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
