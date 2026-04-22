import { useCallback } from "react";
import { QuickView } from "@app/app/QuickView";
import { ShadowScope } from "./ShadowScope";
import { appStyles } from "./app-styles";
import { useDemoState, dispatch } from "./store";

export function QuickViewDemo() {
  const state = useDemoState();

  const stacks = state.stacks;
  const draft = state.view.kind === "quick" ? state.view.draft : "";

  const onCommit = useCallback(() => {
    if (state.view.kind === "quick" && state.view.draft.trim()) {
      // Create task in the active stack via the real reducer…
      dispatch({ type: "quick-add.commit" });
      // …then re-open quick view so the demo stays usable.
      dispatch({ type: "view.open-quick" });
    }
  }, [state.view]);

  const onCancel = useCallback(() => {
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
