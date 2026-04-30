import type { AppState } from "../../types";
import type { WindowSpec } from "../manager";
import type { QuickResponse, ShowQuickRequest } from "./types";

export const quickSpec: WindowSpec<AppState, ShowQuickRequest, QuickResponse> = {
  label: "quick",
  url: "/quick.html",
  options: {
    title: "Quick add",
    transparent: true,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    width: 620,
    height: 148,
    resizable: false,
    shadow: true,
    focus: false,
    center: true,
  },
  desired: (state) =>
    state.presented === "quick"
      ? {
          visible: true,
          payload: {
            stacks: state.stacks,
            activeStackId: state.activeStackId,
          },
        }
      : { visible: false },
  onResponse: (response) => {
    switch (response.kind) {
      case "commit":
        return {
          type: "quick.commit-task",
          text: response.text,
          stackId: response.stackId ?? undefined,
        };
      case "set-active-stack":
        return { type: "set-active-stack", stackId: response.stackId };
      case "dismiss":
        return { type: "present.set", window: null };
    }
  },
};
