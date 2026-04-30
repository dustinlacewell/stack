import { combosEqual, type KeyCombo } from "./keys";
import type { ReducerAction } from "./reducer";

export type Scope =
  | "global-os"
  | "global"
  | "list"
  | "edit"
  | "modal";

export type ActionId =
  // OS-level (registered with tauri-plugin-global-shortcut). These can fire
  // when the app doesn't have focus, so the Rust process is what receives
  // the chord and emits a "shortcut:fired" event.
  | "app.toggle-window"
  | "app.quick-add"
  | "app.search"
  // window-scoped fallbacks (fire from any focused window of ours)
  | "app.hide"
  | "app.pin-toggle"
  | "app.open-settings"
  // stack nav
  | "nav.prev-stack"
  | "nav.next-stack"
  // task nav within active stack
  | "nav.prev-task"
  | "nav.next-task"
  // task ops
  | "task.toggle"
  | "task.toggle-habit"
  | "task.delete"
  | "task.indent"
  | "task.outdent"
  | "task.new-here"
  | "task.new-on-top"
  // stack ops
  | "stack.new"
  | "stack.rename-active"
  | "stack.delete-active"
  // editing (input focused) — handled inside EditingInput; listed for the
  // settings UI to advertise/rebind, never dispatched from the global handler
  | "edit.commit"
  | "edit.cancel"
  // modal / confirm
  | "modal.confirm"
  | "modal.cancel";

// What this action does when triggered. Either a static reducer action
// (most cases) or a function that returns one (or `null` to do nothing —
// useful for actions whose handling lives elsewhere). Keeping the shape
// uniform lets the dispatcher be a one-liner.
export type ActionDispatch = ReducerAction | (() => ReducerAction | null);

export type ActionDef = {
  id: ActionId;
  description: string;
  scope: Scope | Scope[];
  defaultBindings: KeyCombo[];
  dispatch: ActionDispatch;
};

export function actionInScope(a: ActionDef, scope: Scope): boolean {
  return Array.isArray(a.scope) ? a.scope.includes(scope) : a.scope === scope;
}

export function primaryScope(a: ActionDef): Scope {
  return Array.isArray(a.scope) ? a.scope[0] : a.scope;
}

// Resolve an action's dispatch to a concrete reducer action. Returns null
// when the action has no work to do in the current state (e.g. edit.*,
// which is owned by EditingInput).
export function resolveDispatch(a: ActionDef): ReducerAction | null {
  return typeof a.dispatch === "function" ? a.dispatch() : a.dispatch;
}

export const ACTIONS: ActionDef[] = [
  {
    id: "app.toggle-window",
    description: "Show/hide the stack window",
    scope: "global-os",
    defaultBindings: [{ key: "s", ctrl: true, alt: true }],
    dispatch: { type: "present.toggle", window: "main" },
  },
  {
    id: "app.quick-add",
    description: "Quick-add a task to the top of the active stack",
    scope: "global-os",
    defaultBindings: [{ key: "n", ctrl: true, alt: true }],
    dispatch: { type: "present.toggle", window: "quick" },
  },
  {
    id: "app.search",
    description: "Search stacks and tasks",
    scope: "global-os",
    defaultBindings: [{ key: "f", ctrl: true, alt: true }],
    dispatch: { type: "present.toggle", window: "search" },
  },
  {
    id: "app.hide",
    description: "Hide the window",
    scope: "global",
    defaultBindings: [{ key: "Escape" }],
    dispatch: { type: "present.set", window: null },
  },
  {
    id: "app.pin-toggle",
    description: "Toggle pin (keeps window visible on blur)",
    scope: "global",
    defaultBindings: [],
    dispatch: { type: "toggle-pin" },
  },
  {
    id: "app.open-settings",
    description: "Open settings",
    scope: "list",
    defaultBindings: [{ key: ",", ctrl: true }],
    dispatch: { type: "present.toggle", window: "settings" },
  },

  {
    id: "nav.prev-stack",
    description: "Move to the previous stack",
    scope: "list",
    defaultBindings: [{ key: "ArrowUp", ctrl: true }],
    dispatch: { type: "cycle-stack", dir: -1 },
  },
  {
    id: "nav.next-stack",
    description: "Move to the next stack",
    scope: "list",
    defaultBindings: [{ key: "ArrowDown", ctrl: true }],
    dispatch: { type: "cycle-stack", dir: 1 },
  },
  {
    id: "nav.prev-task",
    description: "Select the previous task",
    scope: "list",
    defaultBindings: [{ key: "ArrowUp" }],
    dispatch: { type: "nav-task", dir: -1 },
  },
  {
    id: "nav.next-task",
    description: "Select the next task",
    scope: "list",
    defaultBindings: [{ key: "ArrowDown" }],
    dispatch: { type: "nav-task", dir: 1 },
  },

  {
    id: "task.toggle",
    description: "Toggle completion of the selected task (cascades to children)",
    scope: "list",
    defaultBindings: [{ key: "Enter" }],
    dispatch: { type: "toggle-selected" },
  },
  {
    id: "task.toggle-habit",
    description:
      "Toggle habit on the selected task — habits clear their children's done flags at midnight",
    scope: "list",
    defaultBindings: [{ key: "h" }],
    dispatch: { type: "toggle-habit-selected" },
  },
  {
    id: "task.delete",
    description: "Delete the selected task (and its children)",
    scope: "list",
    defaultBindings: [{ key: "Delete" }, { key: "Backspace" }],
    dispatch: { type: "delete-selected" },
  },
  {
    id: "task.indent",
    description: "Indent the selected task",
    scope: "list",
    defaultBindings: [{ key: "Tab" }],
    dispatch: { type: "indent-selected" },
  },
  {
    id: "task.outdent",
    description: "Outdent the selected task",
    scope: "list",
    defaultBindings: [{ key: "Tab", shift: true }],
    dispatch: { type: "outdent-selected" },
  },
  {
    id: "task.new-here",
    description: "Create a new task after the selected one",
    scope: "list",
    defaultBindings: [{ key: "Enter", ctrl: true }],
    dispatch: { type: "new-task-here-start" },
  },
  {
    id: "task.new-on-top",
    description: "Create a new task at the top of the active stack",
    scope: "list",
    defaultBindings: [{ key: "n", ctrl: true }],
    dispatch: { type: "new-task-on-top-start" },
  },

  {
    id: "stack.new",
    description: "Create a new stack and start editing its name",
    scope: "list",
    defaultBindings: [{ key: "s", ctrl: true }],
    dispatch: { type: "new-stack-start" },
  },
  {
    id: "stack.rename-active",
    description: "Rename the active stack",
    scope: "list",
    defaultBindings: [{ key: "F2" }],
    dispatch: { type: "rename-active-stack-start" },
  },
  {
    id: "stack.delete-active",
    description: "Delete the active stack (asks to confirm)",
    scope: "list",
    defaultBindings: [{ key: "Delete", ctrl: true, shift: true }],
    dispatch: { type: "request-delete-active-stack" },
  },

  // edit.* fire from inside EditingInput, which calls stopPropagation. The
  // global dispatcher never sees them, but they're listed so settings can
  // present and rebind them. dispatch is a no-op.
  {
    id: "edit.commit",
    description: "Save the current edit",
    scope: "edit",
    defaultBindings: [{ key: "Enter" }],
    dispatch: () => null,
  },
  {
    id: "edit.cancel",
    description: "Cancel the current edit",
    scope: "edit",
    defaultBindings: [{ key: "Escape" }],
    dispatch: () => null,
  },

  {
    id: "modal.confirm",
    description: "Confirm the modal action",
    scope: "modal",
    defaultBindings: [{ key: "Enter" }],
    dispatch: { type: "confirm-commit" },
  },
  {
    id: "modal.cancel",
    description: "Dismiss the modal",
    scope: "modal",
    defaultBindings: [{ key: "Escape" }],
    dispatch: { type: "confirm-cancel" },
  },
];

export const ACTIONS_BY_ID: Record<ActionId, ActionDef> = Object.fromEntries(
  ACTIONS.map((a) => [a.id, a])
) as Record<ActionId, ActionDef>;

export type BindingOverrides = Partial<Record<ActionId, KeyCombo[]>>;

export function getBindings(
  actionId: ActionId,
  overrides: BindingOverrides
): KeyCombo[] {
  const o = overrides[actionId];
  if (o) return o;
  return ACTIONS_BY_ID[actionId].defaultBindings;
}

// Set `actionId`'s override to `combos` and strip those combos from every
// other action sharing any of its scopes. VSCode-style "latest claim wins".
// Exported for use in both Record flow (Settings) and normalize flow (boot).
export function claimCombo(
  prev: BindingOverrides,
  actionId: ActionId,
  combos: KeyCombo[]
): BindingOverrides {
  const next: BindingOverrides = { ...prev, [actionId]: combos };
  const claimer = ACTIONS_BY_ID[actionId];
  const claimerScopes = new Set(
    Array.isArray(claimer.scope) ? claimer.scope : [claimer.scope]
  );
  for (const other of ACTIONS) {
    if (other.id === actionId) continue;
    const otherScopes = Array.isArray(other.scope)
      ? other.scope
      : [other.scope];
    if (!otherScopes.some((s) => claimerScopes.has(s))) continue;
    const current = getBindings(other.id, next);
    const filtered = current.filter(
      (c) => !combos.some((claimed) => combosEqual(c, claimed))
    );
    if (filtered.length !== current.length) {
      next[other.id] = filtered;
    }
  }
  return next;
}

// Resolve any cross-action combo collisions among *user overrides* in the
// stored file. Collisions are a user-created phenomenon (the UI prevents
// them going forward, but older builds, hand-edits, or partial writes could
// leave the file inconsistent). We iterate ACTIONS in reverse so later-in-
// registry overrides win ties — matches a user who rebinds downward (most
// recent rebind keeps the combo). Actions without an override entry are
// skipped: their defaults are authored and can't legitimately collide, and
// rewriting them as "overrides" would freeze users to today's defaults.
export function normalizeOverrides(
  prev: BindingOverrides
): BindingOverrides {
  let next = prev;
  for (let i = ACTIONS.length - 1; i >= 0; i--) {
    const action = ACTIONS[i];
    if (!(action.id in next)) continue;
    const bindings = next[action.id]!;
    if (bindings.length === 0) continue;
    next = claimCombo(next, action.id, bindings);
  }
  return next;
}
