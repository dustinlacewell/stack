export type TaskId = string;
export type StackId = string;

export type Task = {
  id: TaskId;
  text: string;
  done: boolean;
  // Root of a habit subtree. Descendants inherit — never set `habit: true`
  // on a task whose ancestor is already a habit. Use `isHabit(task, ancestors)`
  // to query the effective value.
  habit?: boolean;
  children: Task[];
  createdAt: number;
};

export type Stack = {
  id: StackId;
  name: string;
  tasks: Task[];
  createdAt: number;
};

export type Editing =
  | null
  | { kind: "stack-name"; stackId: StackId; draft: string }
  | { kind: "task"; taskId: TaskId; draft: string }
  | { kind: "new-stack"; draft: string }
  | {
      kind: "new-task";
      stackId: StackId;
      parentId: TaskId | null;
      afterId: TaskId | null;
      draft: string;
    };

export type Confirming =
  | null
  | { kind: "delete-stack"; stackId: StackId };

export type SettingsTab = "keybindings" | "about";

export type View =
  | { kind: "stack" }
  | { kind: "quick"; draft: string }
  | { kind: "settings"; tab: SettingsTab };

export type WindowSize = { w: number; h: number };

export type AppState = {
  // Data
  stacks: Stack[];
  activeStackId: StackId | null;
  selectedTaskId: TaskId | null;

  // Remembered window geometry for the stack view only. null = use default.
  // Quick-add is fixed; settings opens at a fixed default each time.
  stackViewSize: WindowSize | null;

  // What's on screen right now — React renders from this.
  view: View;
  // When the user asks to switch views while the window is visible we
  // don't change `view` synchronously; the reducer hides the window and
  // parks the target here. The reconciler commits it after the hide
  // actually lands (`commit-pending-open`) so React never paints the new
  // view into the still-visible, wrong-sized window.
  pendingOpen: View | null;

  // Last local date (YYYY-MM-DD) on which habit `done` flags were cleared.
  // The scheduler compares this against today on boot / focus / timer tick so
  // resets survive restarts, sleep/wake, and timezone changes.
  lastHabitResetDate: string | null;

  // Transient UI overlays
  editing: Editing;
  confirming: Confirming;

  // Native window, reconciled by effects
  windowVisible: boolean;
  pinned: boolean;
};

export type FlatEntry = {
  task: Task;
  depth: number;
  parentId: TaskId | null;
  indexInParent: number;
};
