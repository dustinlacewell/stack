import type { Dispatch } from "react";
import type { ReducerAction } from "../reducer";
import type { AppState, Stack } from "../types";
import { StackList } from "../components/StackList";
import { TaskTree } from "../components/TaskTree";
import { HotkeyWarning } from "./HotkeyWarning";
import "./StackView.css";

type Props = {
  state: AppState;
  activeStack: Stack | null;
  hasHotkeyFailures: boolean;
  dispatch: Dispatch<ReducerAction>;
  onOpenSettings: () => void;
};

export function StackView({
  state,
  activeStack,
  hasHotkeyFailures,
  dispatch,
  onOpenSettings,
}: Props) {
  return (
    <div className="stack-pane">
      {hasHotkeyFailures && <HotkeyWarning onClick={onOpenSettings} />}
      <div className="columns">
        <StackList state={state} dispatch={dispatch} />
        <TaskTree state={state} stack={activeStack} dispatch={dispatch} />
      </div>
    </div>
  );
}
