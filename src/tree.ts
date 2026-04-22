import type { FlatEntry, Task, TaskId } from "./types";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newTask(text = ""): Task {
  return {
    id: uid(),
    text,
    done: false,
    children: [],
    createdAt: Date.now(),
  };
}

export function flatten(
  tasks: Task[],
  depth = 0,
  parentId: TaskId | null = null
): FlatEntry[] {
  const out: FlatEntry[] = [];
  tasks.forEach((t, i) => {
    out.push({ task: t, depth, parentId, indexInParent: i });
    out.push(...flatten(t.children, depth + 1, t.id));
  });
  return out;
}

export function findTask(
  tasks: Task[],
  id: TaskId
): { task: Task; parent: Task | null; index: number } | null {
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) return { task: tasks[i], parent: null, index: i };
    const stack: Array<{ task: Task; parent: Task }> = tasks[i].children.map(
      (c) => ({ task: c, parent: tasks[i] })
    );
    while (stack.length) {
      const { task, parent } = stack.pop()!;
      if (task.id === id) {
        const index = parent.children.indexOf(task);
        return { task, parent, index };
      }
      for (const c of task.children) stack.push({ task: c, parent: task });
    }
  }
  return null;
}

export function mapTasks(tasks: Task[], fn: (t: Task) => Task): Task[] {
  return tasks.map((t) => {
    const next = fn(t);
    if (next === t && t.children.length === 0) return t;
    return { ...next, children: mapTasks(next.children, fn) };
  });
}

function removeFrom(tasks: Task[], id: TaskId): { next: Task[]; removed: Task | null } {
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx >= 0) {
    const removed = tasks[idx];
    return { next: tasks.slice(0, idx).concat(tasks.slice(idx + 1)), removed };
  }
  let removed: Task | null = null;
  const next = tasks.map((t) => {
    if (removed) return t;
    const r = removeFrom(t.children, id);
    if (r.removed) {
      removed = r.removed;
      return { ...t, children: r.next };
    }
    return t;
  });
  return { next, removed };
}

function insertAsChildAt(tasks: Task[], parentId: TaskId, index: number, child: Task): Task[] {
  return tasks.map((t) => {
    if (t.id === parentId) {
      const kids = t.children.slice();
      kids.splice(Math.max(0, Math.min(index, kids.length)), 0, child);
      return { ...t, children: kids };
    }
    if (t.children.length > 0)
      return { ...t, children: insertAsChildAt(t.children, parentId, index, child) };
    return t;
  });
}

function insertAtRoot(tasks: Task[], index: number, child: Task): Task[] {
  const next = tasks.slice();
  next.splice(Math.max(0, Math.min(index, next.length)), 0, child);
  return next;
}

export function insertTask(
  tasks: Task[],
  opts: {
    parentId: TaskId | null;
    afterId: TaskId | null;
    task: Task;
    atTop?: boolean;
  }
): Task[] {
  const { parentId, afterId, task, atTop } = opts;

  if (atTop) {
    if (parentId === null) return insertAtRoot(tasks, 0, task);
    return insertAsChildAt(tasks, parentId, 0, task);
  }

  if (afterId) {
    const found = findTask(tasks, afterId);
    if (!found) return insertAtRoot(tasks, 0, task);
    if (found.parent === null) return insertAtRoot(tasks, found.index + 1, task);
    return insertAsChildAt(tasks, found.parent.id, found.index + 1, task);
  }

  if (parentId === null) return insertAtRoot(tasks, 0, task);
  return insertAsChildAt(tasks, parentId, 0, task);
}

export function deleteTask(tasks: Task[], id: TaskId): Task[] {
  return removeFrom(tasks, id).next;
}

function cascade(task: Task, done: boolean): Task {
  return {
    ...task,
    done,
    children: task.children.map((c) => cascade(c, done)),
  };
}

export function toggleTaskCascade(tasks: Task[], id: TaskId): Task[] {
  const found = findTask(tasks, id);
  if (!found) return tasks;
  const nextDone = !found.task.done;
  return mapTasks(tasks, (t) => (t.id === id ? cascade(t, nextDone) : t));
}

// Make a task (and its subtree) a child of its previous sibling.
export function indentTask(tasks: Task[], id: TaskId): Task[] {
  const found = findTask(tasks, id);
  if (!found) return tasks;
  const siblings = found.parent ? found.parent.children : tasks;
  if (found.index === 0) return tasks;
  const prevSibling = siblings[found.index - 1];
  const { next: withoutTarget, removed } = removeFrom(tasks, id);
  if (!removed) return tasks;
  return insertAsChildAt(
    withoutTarget,
    prevSibling.id,
    prevSibling.children.length,
    removed
  );
}

// Move a task out to become a sibling of its parent (just after the parent).
export function findFirstOpen(tasks: Task[]): Task | null {
  for (const t of tasks) {
    if (!t.done) return t;
    const nested = findFirstOpen(t.children);
    if (nested) return nested;
  }
  return null;
}

export function countAllTasks(tasks: Task[]): number {
  let n = 0;
  const walk = (arr: Task[]) => {
    for (const t of arr) {
      n++;
      if (t.children.length) walk(t.children);
    }
  };
  walk(tasks);
  return n;
}

export function countOpenTasks(tasks: Task[]): number {
  let n = 0;
  const walk = (arr: Task[]) => {
    for (const t of arr) {
      if (!t.done) n++;
      if (t.children.length) walk(t.children);
    }
  };
  walk(tasks);
  return n;
}

// Effective habit status: true iff `id` itself carries `habit`, or any ancestor
// does. Habits inherit down the subtree; the flag lives only on the topmost
// habit node, which is what `toggleHabit` enforces.
export function isHabit(tasks: Task[], id: TaskId): boolean {
  const walk = (arr: Task[], inherited: boolean): boolean | null => {
    for (const t of arr) {
      const here = inherited || !!t.habit;
      if (t.id === id) return here;
      const nested = walk(t.children, here);
      if (nested !== null) return nested;
    }
    return null;
  };
  return walk(tasks, false) ?? false;
}

// True iff `id` inherits habit status from an ancestor (i.e. it's inside a
// habit subtree but isn't itself the root). These can't be toggled directly —
// toggle the ancestor instead.
export function isHabitInherited(tasks: Task[], id: TaskId): boolean {
  const walk = (arr: Task[], inherited: boolean): boolean | null => {
    for (const t of arr) {
      if (t.id === id) return inherited;
      const nested = walk(t.children, inherited || !!t.habit);
      if (nested !== null) return nested;
    }
    return null;
  };
  return walk(tasks, false) ?? false;
}

// Toggle habit at `id`. If `id` is inside an ancestor's habit subtree, this
// is a no-op (UI disables the action; belt-and-braces here). Otherwise flip
// `habit`, and when turning it on, clear any descendants' redundant habit
// flags so the invariant "flag lives only at the root" holds.
export function toggleHabit(tasks: Task[], id: TaskId): Task[] {
  if (isHabitInherited(tasks, id)) return tasks;
  const transform = (arr: Task[]): Task[] =>
    arr.map((t) => {
      if (t.id === id) {
        if (t.habit) {
          const { habit: _drop, ...rest } = t;
          return rest as Task;
        }
        return { ...t, habit: true, children: stripHabitFlags(t.children) };
      }
      if (t.children.length === 0) return t;
      const kids = transform(t.children);
      return kids === t.children ? t : { ...t, children: kids };
    });
  return transform(tasks);
}

function stripHabitFlags(tasks: Task[]): Task[] {
  return tasks.map((t) => {
    const kids = t.children.length ? stripHabitFlags(t.children) : t.children;
    if (!t.habit) return kids === t.children ? t : { ...t, children: kids };
    const { habit: _drop, ...rest } = t;
    return { ...(rest as Task), children: kids };
  });
}

// Clear `done` on every task inside a habit subtree. Walks once; when it
// enters a habit root it flips `done` to false for that whole subtree.
export function resetHabitDones(tasks: Task[]): Task[] {
  const walk = (arr: Task[], inherited: boolean): Task[] =>
    arr.map((t) => {
      const inside = inherited || !!t.habit;
      const kids = walk(t.children, inside);
      if (inside) {
        if (!t.done && kids === t.children) return t;
        return { ...t, done: false, children: kids };
      }
      if (kids === t.children) return t;
      return { ...t, children: kids };
    });
  return walk(tasks, false);
}

export function isDescendant(
  tasks: Task[],
  ancestorId: TaskId,
  id: TaskId
): boolean {
  const found = findTask(tasks, ancestorId);
  if (!found) return false;
  const stack: Task[] = [...found.task.children];
  while (stack.length) {
    const t = stack.pop()!;
    if (t.id === id) return true;
    for (const c of t.children) stack.push(c);
  }
  return false;
}

// Target addressing for a drag-drop move. "before"/"after" identify a
// sibling and insert at that level; "child-of" re-parents as the first
// child of a target task (or at the root when parentId is null).
export type MoveTarget =
  | { kind: "before" | "after"; siblingId: TaskId }
  | { kind: "child-of"; parentId: TaskId | null };

// Move `id` (with its subtree) to `target`. No-ops if the source is
// missing, the target is invalid, or the move would put the task inside
// its own subtree. Returns the new tree; identity-preserving when nothing
// changes so React's equality checks stay cheap.
export function moveTask(
  tasks: Task[],
  id: TaskId,
  target: MoveTarget
): Task[] {
  if (target.kind === "child-of" && target.parentId === id) return tasks;
  if (target.kind !== "child-of" && target.siblingId === id) return tasks;
  if (target.kind === "child-of" && target.parentId !== null) {
    if (isDescendant(tasks, id, target.parentId)) return tasks;
  }
  if (target.kind !== "child-of") {
    if (isDescendant(tasks, id, target.siblingId)) return tasks;
  }

  const { next: without, removed } = removeFrom(tasks, id);
  if (!removed) return tasks;

  if (target.kind === "child-of") {
    if (target.parentId === null) return insertAtRoot(without, 0, removed);
    if (!findTask(without, target.parentId)) return tasks;
    return insertAsChildAt(without, target.parentId, 0, removed);
  }

  const sib = findTask(without, target.siblingId);
  if (!sib) return tasks;
  const offset = target.kind === "before" ? 0 : 1;
  if (sib.parent === null) {
    return insertAtRoot(without, sib.index + offset, removed);
  }
  return insertAsChildAt(
    without,
    sib.parent.id,
    sib.index + offset,
    removed
  );
}

export function outdentTask(tasks: Task[], id: TaskId): Task[] {
  const found = findTask(tasks, id);
  if (!found || !found.parent) return tasks; // already at root
  const parentId = found.parent.id;
  const { next: withoutTarget, removed } = removeFrom(tasks, id);
  if (!removed) return tasks;
  const parentFound = findTask(withoutTarget, parentId);
  if (!parentFound) return tasks;
  if (parentFound.parent === null) {
    return insertAtRoot(withoutTarget, parentFound.index + 1, removed);
  }
  return insertAsChildAt(
    withoutTarget,
    parentFound.parent.id,
    parentFound.index + 1,
    removed
  );
}
