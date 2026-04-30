import type { AppState } from "../../types";
import type { WindowSpec } from "../manager";
import type { SearchResponse, ShowSearchRequest } from "./types";

export const searchSpec: WindowSpec<AppState, ShowSearchRequest, SearchResponse> = {
  label: "search",
  url: "/search.html",
  options: {
    title: "Search",
    transparent: true,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    width: 640,
    height: 400,
    resizable: false,
    shadow: true,
    focus: false,
    center: true,
  },
  desired: (state) =>
    state.presented === "search"
      ? { visible: true, payload: { stacks: state.stacks } }
      : { visible: false },
  onResponse: (response) => {
    if (response.kind === "dismiss") return { type: "present.set", window: null };
    const sel = response.selection;
    return {
      type: "search.go-to",
      stackId: sel.stackId,
      taskId: sel.kind === "task" ? sel.taskId : undefined,
    };
  },
};
