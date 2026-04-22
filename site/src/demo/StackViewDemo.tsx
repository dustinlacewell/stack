import { useReducer } from "react";
import { reducer } from "@app/reducer";
import { StackView } from "@app/app/StackView";
import { Titlebar } from "@app/app/Titlebar";
import { ConfirmDialog } from "@app/components/ConfirmDialog";
import { ShadowScope } from "./ShadowScope";
import { fixtureState } from "./fixture";
import { appStyles } from "./app-styles";

export function StackViewDemo() {
  const [state, dispatch] = useReducer(reducer, undefined, fixtureState);
  const activeStack =
    state.stacks.find((s) => s.id === state.activeStackId) ?? null;

  return (
    <ShadowScope styles={appStyles} className="demo-stack-view">
      <div className="app-frame" style={{ height: "100%" }}>
        <Titlebar
          view={state.view}
          titleText="Stack"
          pinned={state.pinned}
          onOpenSettings={() => {}}
          onTogglePin={() => dispatch({ type: "toggle-pin" })}
          onHide={() => {}}
        />
        <StackView
          state={state}
          activeStack={activeStack}
          hasHotkeyFailures={false}
          dispatch={dispatch}
          onOpenSettings={() => {}}
        />
        {state.confirming?.kind === "delete-stack" && (
          <ConfirmDialog
            title="Delete stack?"
            body="This will permanently delete the stack and all its tasks."
            destructive
            confirmLabel="Delete"
            onConfirm={() => dispatch({ type: "confirm-delete-stack" })}
            onCancel={() => dispatch({ type: "cancel-confirm" })}
          />
        )}
      </div>
    </ShadowScope>
  );
}
