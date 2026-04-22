import type { Dispatch } from "react";
import type { ReducerAction } from "../reducer";
import type { Stack, StackId } from "../types";
import { EditingInput } from "../components/EditingInput";
import { StackSelect } from "../components/StackSelect";
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
        <StackSelect
          stacks={stacks}
          activeStackId={activeStackId}
          disabled={stacks.length === 0}
          onChange={(stackId) =>
            dispatch({ type: "set-active-stack", stackId })
          }
        />
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
