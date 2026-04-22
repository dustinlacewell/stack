import { useReducer, useCallback } from "react";
import { reducer } from "@app/reducer";
import { QuickView } from "@app/app/QuickView";
import { ShadowScope } from "./ShadowScope";
import { fixtureState } from "./fixture";
import { appStyles } from "./app-styles";

export function QuickViewDemo() {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const s = fixtureState();
    // Start with the quick view open and a draft in progress
    return { ...s, view: { kind: "quick" as const, draft: "" } };
  });

  const stacks = state.stacks;
  const draft = state.view.kind === "quick" ? state.view.draft : "";

  const onCommit = useCallback(() => {
    if (state.view.kind === "quick" && state.view.draft.trim()) {
      dispatch({ type: "view.quick-commit" });
      // Re-open quick view for continued demo
      dispatch({ type: "show-quick" });
    }
  }, [state.view]);

  const onCancel = useCallback(() => {
    // In the demo, just clear the draft instead of hiding
    dispatch({ type: "view.quick-update-draft", draft: "" });
  }, []);

  return (
    <ShadowScope styles={appStyles} className="demo-quick-view">
      <div className="app-frame" style={{ padding: 0 }}>
        <QuickView
          draft={draft}
          stacks={stacks}
          activeStackId={state.activeStackId}
          dispatch={dispatch}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      </div>
    </ShadowScope>
  );
}
