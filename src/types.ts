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

// One label per OS window. The "main" window hosts the stack view; quick,
// search, and settings each live in their own webview. At most one is
// presented at a time — see AppState.presented.
export type WindowLabel = "main" | "quick" | "search" | "settings";

export type WindowSize = { w: number; h: number };

// Portal menu — overlay UI on top of whatever window is presented. Lives
// in its own webview but doesn't replace the current presentation; it
// floats over and dismisses.
//
// `requestId` is a fresh nonce per open so a stale dismiss can't clobber
// a freshly-opened menu.
export type PortalState = {
  requestId: string;
  request: PortalShowRequest;
};

// Re-exposed here to avoid cyclic imports on the portal types module.
// The portal layer is still the canonical owner of the field shapes.
export type PortalShowRequest = {
  items: import("./windows/portal/types").PortalItem[];
  screenX: number;
  screenY: number;
  minWidth?: number;
  selectedId?: string;
};

// Output of the Rust shortcut registrar: which combos succeeded and which
// failed. Kept in reducer state so the settings window can render a fresh
// snapshot whenever it changes.
export type RegistrationOutcome = {
  action: import("./actions").ActionId;
  accel: string;
  succeeded: boolean;
  fallback: boolean;
  error: string | null;
};

export type AppState = {
  // --- Data -----------------------------------------------------------------
  stacks: Stack[];
  activeStackId: StackId | null;
  selectedTaskId: TaskId | null;

  // Remembered geometry for the user-resizable main window. `null` = use
  // the built-in default. Other windows are fixed-size, no persistence.
  stackViewSize: WindowSize | null;

  // Last local date (YYYY-MM-DD) on which habit `done` flags were cleared.
  // The scheduler compares this against today on boot / focus / timer tick so
  // resets survive restarts, sleep/wake, and timezone changes.
  lastHabitResetDate: string | null;

  pinned: boolean;

  // --- Stack-window UI ------------------------------------------------------
  // Editing and confirming are modal *over* the stack window; they're
  // owned by the main reducer because they reference stack data.
  editing: Editing;
  confirming: Confirming;

  // Settings tab persists across close/reopen of the settings window.
  settingsTab: SettingsTab;

  // User keybinding overrides. Persisted to disk; drives OS-shortcut
  // registration via an effect that watches this field.
  overrides: import("./actions").BindingOverrides;

  // Output of the most recent shortcut registration pass. Surfaced in
  // settings so the user can see why a binding isn't working.
  registrationOutcomes: RegistrationOutcome[];

  // --- Window presentation --------------------------------------------------
  // Which window is on screen, or `null` for "all hidden". A reconciler
  // in App.tsx maps this to OS-level show/hide for each registered window.
  presented: WindowLabel | null;

  // Portal menu (overlay). Reconciled separately — it floats on top of
  // whichever window is presented.
  portal: PortalState | null;
};

export type FlatEntry = {
  task: Task;
  depth: number;
  parentId: TaskId | null;
  indexInParent: number;
};
