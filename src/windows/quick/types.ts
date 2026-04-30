import type { Stack, StackId } from "../../types";

// main → quick. Snapshot of just the data the quick window needs.
export type ShowQuickRequest = {
  stacks: Stack[];
  activeStackId: StackId | null;
};

// quick → main. Either a commit (text + chosen stack) or dismissal.
export type QuickResponse =
  | { kind: "commit"; text: string; stackId: StackId | null }
  | { kind: "set-active-stack"; stackId: StackId }
  | { kind: "dismiss" };
