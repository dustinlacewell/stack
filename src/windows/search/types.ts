import type { Stack, StackId, TaskId } from "../../types";

// Payload for `search:show` — main → search. A snapshot of the stacks so
// the search window doesn't need to duplicate hydration. Fresh on every open.
export type ShowSearchRequest = {
  stacks: Stack[];
};

// Payload for `search:select` — search → main.
export type SearchSelection =
  | { kind: "stack"; stackId: StackId }
  | { kind: "task"; stackId: StackId; taskId: TaskId };

export type SearchResponse =
  | { kind: "select"; selection: SearchSelection }
  | { kind: "dismiss" };
