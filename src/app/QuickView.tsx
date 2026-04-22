import type { Dispatch } from "react";
import type { ReducerAction } from "../reducer";
import type { Stack, StackId } from "../types";
import { EditingInput } from "../components/EditingInput";
import { Kbd } from "../design";
import "./QuickView.css";

type Props = {
  draft: string;
  stacks: Stack[];
  activeStackId: StackId | null;
  dispatch: Dispatch<ReducerAction>;
  onCommit: () => void;
  onCancel: () => void;
};

export function QuickView({
  draft,
  stacks,
  activeStackId,
  dispatch,
  onCommit,
  onCancel,
}: Props) {
  return (
    <div className="quick">
      <div className="quick-row">
        <select
          className="stack-select"
          value={activeStackId ?? ""}
          onChange={(e) =>
            dispatch({
              type: "set-active-stack",
              stackId: e.currentTarget.value,
            })
          }
          disabled={stacks.length === 0}
          tabIndex={-1}
          title="Target stack (Ctrl+↑/↓ cycles)"
        >
          {stacks.length === 0 ? (
            <option value="">Todo (new)</option>
          ) : (
            stacks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || "Untitled"}
              </option>
            ))
          )}
        </select>
        <EditingInput
          value={draft}
          placeholder="Quick thought…"
          onChange={(v) =>
            dispatch({ type: "view.quick-update-draft", draft: v })
          }
          onCommit={onCommit}
          onCancel={onCancel}
          commitOnBlur={false}
        />
      </div>
      <div className="hint">
        <Kbd>Enter</Kbd> save · <Kbd>Esc</Kbd> dismiss ·{" "}
        <Kbd>Ctrl+↑↓</Kbd> change stack
      </div>
    </div>
  );
}
