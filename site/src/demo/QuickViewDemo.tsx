import { useCallback, useState } from "react";
import { ShadowScope } from "./ShadowScope";
import { appStyles } from "./app-styles";
import { useDemoState, dispatch } from "./store";

/**
 * Site-only mirror of the desktop app's quick window. The real app
 * renders the quick palette in its own webview; here we render a
 * standalone component with matching visuals + behavior so the marketing
 * page can show what it feels like.
 *
 * Local state for `draft` and `selectedStackId`; commits go through the
 * shared demo reducer via `quick.commit-task`.
 */
export function QuickViewDemo() {
  const state = useDemoState();
  const [draft, setDraft] = useState("");
  const [stackId, setStackId] = useState<string | null>(state.activeStackId);

  const cycle = useCallback(
    (dir: -1 | 1) => {
      if (state.stacks.length === 0) return;
      const idx = state.stacks.findIndex((s) => s.id === stackId);
      const next = (idx + dir + state.stacks.length) % state.stacks.length;
      setStackId(state.stacks[next].id);
    },
    [stackId, state.stacks],
  );

  const commit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    dispatch({
      type: "quick.commit-task",
      text,
      stackId: stackId ?? undefined,
    });
    setDraft("");
  }, [draft, stackId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        commit();
        return;
      case "Escape":
        e.preventDefault();
        setDraft("");
        return;
      case "ArrowUp":
        if (e.ctrlKey) {
          e.preventDefault();
          cycle(-1);
        }
        return;
      case "ArrowDown":
        if (e.ctrlKey) {
          e.preventDefault();
          cycle(1);
        }
        return;
    }
  };

  const active = state.stacks.find((s) => s.id === stackId);
  const stackLabel = active
    ? active.name || "Untitled"
    : state.stacks.length === 0
      ? "Todo (new)"
      : "Select…";

  return (
    <ShadowScope styles={appStyles} className="demo-quick-view">
      <div className="quick">
        <div className="quick-row">
          <div
            className={`quick-stack-trigger${
              state.stacks.length === 0 ? " disabled" : ""
            }`}
            title="Target stack (Ctrl+↑/↓ cycles)"
          >
            <span className="quick-stack-label">{stackLabel}</span>
            <span className="quick-stack-caret" aria-hidden="true" />
          </div>
          <input
            className="quick-input"
            placeholder="Quick thought…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </ShadowScope>
  );
}
