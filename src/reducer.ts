import type {
  AppState,
  SettingsTab,
  Stack,
  StackId,
  Task,
  TaskId,
  View,
  WindowSize,
} from "./types";
import {
  deleteTask,
  findTask,
  flatten,
  indentTask,
  insertTask,
  mapTasks,
  moveTask,
  newTask,
  outdentTask,
  resetHabitDones,
  toggleHabit,
  toggleTaskCascade,
  uid,
  type MoveTarget,
} from "./tree";

export function initialState(): AppState {
  return {
    stacks: [],
    activeStackId: null,
    selectedTaskId: null,
    stackViewSize: null,
    view: { kind: "stack" },
    pendingOpen: null,
    lastHabitResetDate: null,
    editing: null,
    confirming: null,
    windowVisible: false,
    pinned: false,
  };
}

export type ReducerAction =
  // Hydration
  | {
      type: "hydrate";
      stacks: Stack[];
      activeStackId: string | null;
      pinned: boolean;
      stackViewSize: WindowSize | null;
      lastHabitResetDate: string | null;
    }

  // Habits
  | { type: "toggle-habit-selected" }
  | { type: "toggle-habit"; taskId: TaskId }
  | { type: "habits.reset-if-stale"; today: string }

  // Window sizing
  | { type: "stack-view-resized"; size: WindowSize }

  // Window (reconciled by an effect — reducer never touches Tauri directly)
  | { type: "window.show" }
  | { type: "window.hide" }
  | { type: "window.toggle" }
  | { type: "commit-pending-open" }

  // View
  | { type: "view.open-stack" }
  | { type: "view.open-quick" }
  | { type: "view.toggle-quick" }
  | { type: "view.open-settings"; tab?: SettingsTab }
  | { type: "view.quick-update-draft"; draft: string }
  | { type: "view.settings-set-tab"; tab: SettingsTab }

  // Intents (compound)
  | { type: "quick-add.commit" }
  | { type: "quick-add.cancel" }
  | { type: "settings.exit" }

  // Pin
  | { type: "toggle-pin" }

  // Stacks
  | { type: "set-active-stack"; stackId: StackId }
  | { type: "cycle-stack"; dir: -1 | 1 }
  | { type: "new-stack-start" }
  | { type: "rename-active-stack-start" }
  | { type: "rename-stack-start"; stackId: StackId }
  | { type: "reorder-stacks"; fromId: StackId; toId: StackId; before: boolean }
  | { type: "edit-stack-commit" }
  | { type: "edit-stack-cancel" }
  | { type: "request-delete-active-stack" }
  | { type: "request-delete-stack"; stackId: StackId }
  | { type: "confirm-commit" }
  | { type: "confirm-cancel" }

  // Tasks — editing
  | { type: "edit-task-start"; taskId: TaskId }
  | { type: "edit-task-commit" }
  | { type: "edit-task-cancel" }
  | { type: "edit-draft"; draft: string }

  // Tasks — creation
  | { type: "new-task-on-top-start" }
  | { type: "new-task-here-start" }
  | { type: "new-task-commit" }
  | { type: "new-task-cancel" }

  // Tasks — ops
  | { type: "select-task"; taskId: TaskId | null }
  | { type: "nav-task"; dir: -1 | 1 }
  | { type: "toggle-selected" }
  | { type: "delete-selected" }
  | { type: "indent-selected" }
  | { type: "outdent-selected" }
  | { type: "reorder-task"; fromId: TaskId; target: MoveTarget };

function activeStack(s: AppState): Stack | null {
  if (!s.activeStackId) return null;
  return s.stacks.find((st) => st.id === s.activeStackId) ?? null;
}

function updateActiveStack(s: AppState, fn: (stack: Stack) => Stack): AppState {
  if (!s.activeStackId) return s;
  return {
    ...s,
    stacks: s.stacks.map((st) => (st.id === s.activeStackId ? fn(st) : st)),
  };
}

function firstTaskIdOf(st: Stack | null): string | null {
  if (!st || st.tasks.length === 0) return null;
  return st.tasks[0].id;
}

// Hide is a single flip. View/editing/confirming stay put — nobody's
// looking at them while the window is hidden, and touching them here
// would commit a DOM change into the still-visible webview. If the user
// re-opens, the open path explicitly sets the view it wants.
function onHide(s: AppState): AppState {
  return { ...s, windowVisible: false, pendingOpen: null };
}

// changeView is the single entry point for "I want to show this view".
// It picks one of three paths depending on current state:
//   - same view kind, or currently hidden → commit immediately.
//   - visible, different kind             → hide first, park target in
//                                            pendingOpen. The reconciler
//                                            commits it after hide lands.
// This is the only way the rest of the reducer mutates `view`.
function changeView(state: AppState, view: View): AppState {
  if (state.view.kind === view.kind) {
    return { ...state, view, windowVisible: true, pendingOpen: null };
  }
  if (!state.windowVisible) {
    return { ...state, view, windowVisible: true, pendingOpen: null };
  }
  return { ...state, windowVisible: false, pendingOpen: view };
}

const STACK_VIEW: View = { kind: "stack" };

export function reducer(state: AppState, action: ReducerAction): AppState {
  switch (action.type) {
    case "hydrate": {
      const active =
        action.activeStackId &&
        action.stacks.some((s) => s.id === action.activeStackId)
          ? action.activeStackId
          : action.stacks[0]?.id ?? null;
      const activeStackObj =
        action.stacks.find((s) => s.id === active) ?? null;
      return {
        ...state,
        stacks: action.stacks,
        activeStackId: active,
        pinned: action.pinned,
        stackViewSize: action.stackViewSize,
        lastHabitResetDate: action.lastHabitResetDate,
        selectedTaskId: firstTaskIdOf(activeStackObj),
      };
    }

    case "toggle-habit-selected": {
      if (!state.selectedTaskId) return state;
      return updateActiveStack(state, (st) => ({
        ...st,
        tasks: toggleHabit(st.tasks, state.selectedTaskId!),
      }));
    }

    case "toggle-habit": {
      return updateActiveStack(state, (st) => ({
        ...st,
        tasks: toggleHabit(st.tasks, action.taskId),
      }));
    }

    case "habits.reset-if-stale": {
      if (state.lastHabitResetDate === action.today) return state;
      return {
        ...state,
        stacks: state.stacks.map((s) => ({
          ...s,
          tasks: resetHabitDones(s.tasks),
        })),
        lastHabitResetDate: action.today,
      };
    }

    case "stack-view-resized":
      return { ...state, stackViewSize: action.size };

    case "window.show":
      return changeView(state, STACK_VIEW);

    case "window.hide":
      if (!state.windowVisible && !state.pendingOpen) return state;
      return onHide(state);

    case "window.toggle":
      // Each view-binding toggles its own view: pressing the stack-view
      // shortcut while some other view (quick, settings) is on screen
      // switches to stack rather than hiding — hide is reserved for the
      // "already showing stack" case.
      if (!state.windowVisible) return changeView(state, STACK_VIEW);
      if (state.view.kind === "stack") return onHide(state);
      return changeView(state, STACK_VIEW);

    case "commit-pending-open":
      // Fired by the reconciler after win.hide() actually lands. If the
      // user re-opened (or hid again) in the meantime, their intent wins.
      if (!state.pendingOpen) return state;
      if (state.windowVisible) return { ...state, pendingOpen: null };
      return {
        ...state,
        view: state.pendingOpen,
        windowVisible: true,
        pendingOpen: null,
      };

    case "view.open-stack":
      return changeView(state, STACK_VIEW);

    case "view.open-quick":
      return changeView(state, { kind: "quick", draft: "" });

    case "view.toggle-quick":
      // Toggle acts on what's currently *visible*, not on the last view
      // the reducer committed. The hidden state keeps its `view` intact
      // (so we can resize/paint correctly on the next open), which means
      // `view.kind === "quick" && !windowVisible` is a perfectly normal
      // "closed after quick" state — pressing the binding there should
      // open quick, not try to close an already-closed window.
      // Pressing the quick-add shortcut while quick-add is visible
      // dismisses regardless of pin — matches Escape semantics. Each
      // keybind is a toggle of its own view, not a view switcher.
      if (state.windowVisible && state.view.kind === "quick") {
        return onHide(state);
      }
      return changeView(state, { kind: "quick", draft: "" });

    case "view.open-settings":
      return changeView(state, {
        kind: "settings",
        tab: action.tab ?? "keybindings",
      });

    case "view.quick-update-draft":
      if (state.view.kind !== "quick") return state;
      return { ...state, view: { ...state.view, draft: action.draft } };

    case "view.settings-set-tab":
      if (state.view.kind !== "settings") return state;
      return { ...state, view: { ...state.view, tab: action.tab } };

    case "quick-add.commit": {
      if (state.view.kind !== "quick") return state;
      const text = state.view.draft.trim();
      let next = state;
      if (text) {
        // If the user hasn't created any stack yet, a quick-add shouldn't
        // dead-end — spin up a default "Todo" stack and land the task there.
        let targetId = next.activeStackId;
        if (!targetId || !next.stacks.some((s) => s.id === targetId)) {
          const stack: Stack = {
            id: uid(),
            name: "Todo",
            tasks: [],
            createdAt: Date.now(),
          };
          next = {
            ...next,
            stacks: [...next.stacks, stack],
            activeStackId: stack.id,
          };
          targetId = stack.id;
        }
        const task: Task = newTask(text);
        next = {
          ...next,
          stacks: next.stacks.map((s) =>
            s.id === targetId
              ? {
                  ...s,
                  tasks: insertTask(s.tasks, {
                    parentId: null,
                    afterId: null,
                    task,
                    atTop: true,
                  }),
                }
              : s
          ),
        };
      }
      // Hide unless pinned.
      return next.pinned ? changeView(next, STACK_VIEW) : onHide(next);
    }

    case "quick-add.cancel":
      // Escape from quick-add dismisses the window regardless of pin —
      // "cancel" means "go away", not "switch view".
      return onHide(state);

    case "settings.exit":
      return changeView(state, STACK_VIEW);

    case "toggle-pin":
      return { ...state, pinned: !state.pinned };

    case "set-active-stack": {
      const st = state.stacks.find((s) => s.id === action.stackId);
      return {
        ...state,
        activeStackId: action.stackId,
        selectedTaskId: firstTaskIdOf(st ?? null),
        editing: null,
      };
    }

    case "cycle-stack": {
      if (state.stacks.length === 0) return state;
      const idx = state.stacks.findIndex((s) => s.id === state.activeStackId);
      const next =
        (idx + action.dir + state.stacks.length) % state.stacks.length;
      const stack = state.stacks[next];
      return {
        ...state,
        activeStackId: stack.id,
        selectedTaskId: firstTaskIdOf(stack),
        editing: null,
      };
    }

    case "new-stack-start":
      return { ...state, editing: { kind: "new-stack", draft: "" } };

    case "rename-active-stack-start": {
      const st = activeStack(state);
      if (!st) return state;
      return {
        ...state,
        editing: { kind: "stack-name", stackId: st.id, draft: st.name },
      };
    }

    case "rename-stack-start": {
      const st = state.stacks.find((s) => s.id === action.stackId);
      if (!st) return state;
      return {
        ...state,
        activeStackId: st.id,
        selectedTaskId: firstTaskIdOf(st),
        editing: { kind: "stack-name", stackId: st.id, draft: st.name },
      };
    }

    case "reorder-stacks": {
      const { fromId, toId, before } = action;
      if (fromId === toId) return state;
      const fromIdx = state.stacks.findIndex((s) => s.id === fromId);
      const toIdx = state.stacks.findIndex((s) => s.id === toId);
      if (fromIdx < 0 || toIdx < 0) return state;
      const copy = state.stacks.slice();
      const [moved] = copy.splice(fromIdx, 1);
      // Recompute target index after removal.
      const adjustedToIdx = copy.findIndex((s) => s.id === toId);
      const insertAt = adjustedToIdx + (before ? 0 : 1);
      copy.splice(insertAt, 0, moved);
      return { ...state, stacks: copy };
    }

    case "edit-stack-commit": {
      if (!state.editing) return state;
      if (state.editing.kind === "new-stack") {
        const name = state.editing.draft.trim() || "Untitled";
        const stack: Stack = {
          id: uid(),
          name,
          tasks: [],
          createdAt: Date.now(),
        };
        return {
          ...state,
          stacks: [...state.stacks, stack],
          activeStackId: stack.id,
          selectedTaskId: null,
          editing: {
            kind: "new-task",
            stackId: stack.id,
            parentId: null,
            afterId: null,
            draft: "",
          },
        };
      }
      if (state.editing.kind === "stack-name") {
        const name = state.editing.draft.trim() || "Untitled";
        const stackId = state.editing.stackId;
        return {
          ...state,
          stacks: state.stacks.map((s) =>
            s.id === stackId ? { ...s, name } : s
          ),
          editing: null,
        };
      }
      return state;
    }

    case "edit-stack-cancel":
      return { ...state, editing: null };

    case "request-delete-active-stack": {
      const st = activeStack(state);
      if (!st) return state;
      return {
        ...state,
        confirming: { kind: "delete-stack", stackId: st.id },
      };
    }

    case "request-delete-stack": {
      const st = state.stacks.find((s) => s.id === action.stackId);
      if (!st) return state;
      return {
        ...state,
        confirming: { kind: "delete-stack", stackId: st.id },
      };
    }

    case "confirm-cancel":
      return { ...state, confirming: null };

    case "confirm-commit": {
      if (!state.confirming) return state;
      if (state.confirming.kind === "delete-stack") {
        const delId = state.confirming.stackId;
        const remaining = state.stacks.filter((s) => s.id !== delId);
        // If the deleted stack was active, fall back to the first remaining
        // stack. Otherwise keep the current active stack and selection.
        if (state.activeStackId === delId) {
          const nextActive = remaining[0] ?? null;
          return {
            ...state,
            stacks: remaining,
            activeStackId: nextActive?.id ?? null,
            selectedTaskId: firstTaskIdOf(nextActive),
            confirming: null,
            editing: null,
          };
        }
        return {
          ...state,
          stacks: remaining,
          confirming: null,
        };
      }
      return { ...state, confirming: null };
    }

    case "edit-task-start": {
      const st = activeStack(state);
      if (!st) return state;
      const found = findTask(st.tasks, action.taskId);
      if (!found) return state;
      return {
        ...state,
        selectedTaskId: action.taskId,
        editing: {
          kind: "task",
          taskId: action.taskId,
          draft: found.task.text,
        },
      };
    }

    case "edit-task-commit": {
      if (!state.editing || state.editing.kind !== "task") return state;
      const taskId = state.editing.taskId;
      const draft = state.editing.draft;
      return {
        ...updateActiveStack(state, (st) => ({
          ...st,
          tasks: mapTasks(st.tasks, (t) =>
            t.id === taskId ? { ...t, text: draft } : t
          ),
        })),
        editing: null,
      };
    }

    case "edit-task-cancel":
      return { ...state, editing: null };

    case "edit-draft": {
      if (!state.editing) return state;
      return { ...state, editing: { ...state.editing, draft: action.draft } };
    }

    case "new-task-on-top-start": {
      const st = activeStack(state);
      if (!st) return state;
      return {
        ...state,
        editing: {
          kind: "new-task",
          stackId: st.id,
          parentId: null,
          afterId: null,
          draft: "",
        },
      };
    }

    case "new-task-here-start": {
      const st = activeStack(state);
      if (!st) return state;
      return {
        ...state,
        editing: {
          kind: "new-task",
          stackId: st.id,
          parentId: null,
          afterId: state.selectedTaskId,
          draft: "",
        },
      };
    }

    case "new-task-commit": {
      if (!state.editing || state.editing.kind !== "new-task") return state;
      const { stackId, parentId, afterId, draft } = state.editing;
      const text = draft.trim();
      if (!text) return { ...state, editing: null };
      const task: Task = newTask(text);
      return {
        ...state,
        stacks: state.stacks.map((s) =>
          s.id === stackId
            ? {
                ...s,
                tasks: insertTask(s.tasks, {
                  parentId,
                  afterId,
                  task,
                  atTop: afterId === null && parentId === null,
                }),
              }
            : s
        ),
        selectedTaskId: task.id,
        editing: null,
      };
    }

    case "new-task-cancel":
      return { ...state, editing: null };

    case "select-task":
      return { ...state, selectedTaskId: action.taskId };

    case "nav-task": {
      const st = activeStack(state);
      if (!st) return state;
      const flat = flatten(st.tasks);
      if (flat.length === 0) return state;
      const idx = flat.findIndex((f) => f.task.id === state.selectedTaskId);
      const next =
        idx < 0
          ? 0
          : Math.max(0, Math.min(flat.length - 1, idx + action.dir));
      return { ...state, selectedTaskId: flat[next].task.id };
    }

    case "toggle-selected": {
      if (!state.selectedTaskId) return state;
      return updateActiveStack(state, (st) => ({
        ...st,
        tasks: toggleTaskCascade(st.tasks, state.selectedTaskId!),
      }));
    }

    case "delete-selected": {
      if (!state.selectedTaskId) return state;
      const st = activeStack(state);
      if (!st) return state;
      const flat = flatten(st.tasks);
      const idx = flat.findIndex((f) => f.task.id === state.selectedTaskId);
      const nextTasks = deleteTask(st.tasks, state.selectedTaskId);
      const nextFlat = flatten(nextTasks);
      const nextSelection =
        nextFlat.length === 0
          ? null
          : nextFlat[Math.max(0, Math.min(idx - 1, nextFlat.length - 1))].task
              .id;
      return {
        ...state,
        stacks: state.stacks.map((s) =>
          s.id === st.id ? { ...s, tasks: nextTasks } : s
        ),
        selectedTaskId: nextSelection,
      };
    }

    case "indent-selected": {
      if (!state.selectedTaskId) return state;
      return updateActiveStack(state, (st) => ({
        ...st,
        tasks: indentTask(st.tasks, state.selectedTaskId!),
      }));
    }

    case "outdent-selected": {
      if (!state.selectedTaskId) return state;
      return updateActiveStack(state, (st) => ({
        ...st,
        tasks: outdentTask(st.tasks, state.selectedTaskId!),
      }));
    }

    case "reorder-task": {
      const st = activeStack(state);
      if (!st) return state;
      const nextTasks = moveTask(st.tasks, action.fromId, action.target);
      if (nextTasks === st.tasks) return state;
      return {
        ...updateActiveStack(state, (s) => ({ ...s, tasks: nextTasks })),
        selectedTaskId: action.fromId,
      };
    }

    default:
      return state;
  }
}
