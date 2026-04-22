import { Fragment, useEffect, useRef, useState, type Dispatch } from "react";
import type { ReducerAction } from "../reducer";
import { flatten, isDescendant, isHabit, isHabitInherited } from "../tree";
import type { AppState, Editing, Stack, TaskId } from "../types";
import { Kbd, Menu } from "../design";
import { EditingInput } from "./EditingInput";
import "./TaskTree.css";

type DropZone = "before" | "after" | "into";
type DropTarget = { id: TaskId; zone: DropZone };

type Props = {
  state: AppState;
  stack: Stack | null;
  dispatch: Dispatch<ReducerAction>;
};

export function TaskTree({ state, stack, dispatch }: Props) {
  const { editing, selectedTaskId } = state;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const selectedRowRef = useRef<HTMLLIElement | null>(null);
  const [dragId, setDragId] = useState<TaskId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    taskId: TaskId;
  } | null>(null);

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedTaskId]);

  // Row-vertical thirds: top → sibling-before, middle → re-parent as first
  // child, bottom → sibling-after. Middle band is narrower (40%) to favour
  // the common reorder case over re-parenting.
  const zoneFromEvent = (
    e: React.DragEvent<HTMLLIElement>
  ): DropZone => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pct = y / rect.height;
    if (pct < 0.3) return "before";
    if (pct > 0.7) return "after";
    return "into";
  };

  if (!stack) {
    return (
      <div className="task-tree empty">
        <div className="empty-hint">
          <div className="h">No active stack.</div>
          <div className="k">
            <Kbd>Ctrl+S</Kbd> to create one.
          </div>
        </div>
      </div>
    );
  }

  const flat = flatten(stack.tasks);
  const newTaskEditing =
    editing && editing.kind === "new-task" && editing.stackId === stack.id
      ? (editing as Extract<Editing, { kind: "new-task" }>)
      : null;

  return (
    <section className="task-tree" ref={scrollerRef}>
      <div className="col-header">
        <span className="stack-title">{stack.name}</span>
      </div>

      <ul className="tasks">
        {newTaskEditing &&
          newTaskEditing.afterId === null &&
          newTaskEditing.parentId === null && (
            <li className="task-row editing depth-0">
              <span className="bullet">+</span>
              <EditingInput
                value={newTaskEditing.draft}
                placeholder="New task…"
                onChange={(v) => dispatch({ type: "edit-draft", draft: v })}
                onCommit={() => dispatch({ type: "new-task-commit" })}
                onCancel={() => dispatch({ type: "new-task-cancel" })}
              />
            </li>
          )}

        {flat.map((entry) => {
          const { task, depth } = entry;
          const isSelected = task.id === selectedTaskId;
          const isEditing =
            editing && editing.kind === "task" && editing.taskId === task.id;
          const insertAfter =
            newTaskEditing &&
            newTaskEditing.afterId === task.id &&
            newTaskEditing.parentId === null;

          const isDragging = dragId === task.id;
          const isDropHere = dropTarget?.id === task.id;
          // Indicator inset matches the depth the dropped task will land at.
          // Before/after → target's depth (becomes sibling). Into → target's
          // depth + 1 (becomes first child). Mirrors the depth-N padding
          // ladder in TaskTree.css: base 8px + 14px per level.
          const indicatorDepth =
            isDropHere
              ? dropTarget!.zone === "into"
                ? Math.min(depth, 8) + 1
                : Math.min(depth, 8)
              : null;
          const dropIndent =
            indicatorDepth !== null ? 8 + indicatorDepth * 14 : undefined;
          return (
            <Fragment key={task.id}>
              <li
                ref={isSelected ? selectedRowRef : null}
                style={
                  dropIndent !== undefined
                    ? ({ "--drop-indent": `${dropIndent}px` } as React.CSSProperties)
                    : undefined
                }
                className={[
                  "task-row",
                  `depth-${Math.min(depth, 8)}`,
                  isSelected ? "selected" : "",
                  task.done ? "done" : "",
                  isEditing ? "editing" : "",
                  isDragging ? "dragging" : "",
                  isDropHere && dropTarget?.zone === "before" ? "drop-before" : "",
                  isDropHere && dropTarget?.zone === "after" ? "drop-after" : "",
                  isDropHere && dropTarget?.zone === "into" ? "drop-into" : "",
                ].join(" ")}
                draggable={!isEditing}
                onDragStart={(e) => {
                  if (isEditing) return;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", task.id);
                  setDragId(task.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropTarget(null);
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === task.id) return;
                  // Can't drop into your own subtree.
                  if (isDescendant(stack.tasks, dragId, task.id)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const zone = zoneFromEvent(e);
                  if (dropTarget?.id !== task.id || dropTarget.zone !== zone) {
                    setDropTarget({ id: task.id, zone });
                  }
                }}
                onDragLeave={(e) => {
                  const related = e.relatedTarget as Node | null;
                  if (!related || !e.currentTarget.contains(related)) {
                    setDropTarget((prev) =>
                      prev && prev.id === task.id ? null : prev
                    );
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromId = e.dataTransfer.getData("text/plain") as TaskId;
                  if (
                    fromId &&
                    fromId !== task.id &&
                    dropTarget?.id === task.id &&
                    !isDescendant(stack.tasks, fromId, task.id)
                  ) {
                    const zone = dropTarget.zone;
                    dispatch({
                      type: "reorder-task",
                      fromId,
                      target:
                        zone === "into"
                          ? { kind: "child-of", parentId: task.id }
                          : { kind: zone, siblingId: task.id },
                    });
                  }
                  setDragId(null);
                  setDropTarget(null);
                }}
                onClick={() => dispatch({ type: "select-task", taskId: task.id })}
                onDoubleClick={() =>
                  dispatch({ type: "edit-task-start", taskId: task.id })
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  dispatch({ type: "select-task", taskId: task.id });
                  setContextMenu({ x: e.clientX, y: e.clientY, taskId: task.id });
                }}
              >
                <button
                  className={`check ${task.done ? "checked" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "select-task", taskId: task.id });
                    dispatch({ type: "toggle-selected" });
                  }}
                  aria-label={task.done ? "Mark open" : "Mark done"}
                >
                  {task.done ? "✓" : ""}
                </button>
                {isEditing ? (
                  <EditingInput
                    value={editing.draft}
                    onChange={(v) => dispatch({ type: "edit-draft", draft: v })}
                    onCommit={() => dispatch({ type: "edit-task-commit" })}
                    onCancel={() => dispatch({ type: "edit-task-cancel" })}
                  />
                ) : (
                  <span className="text">
                    {task.text || <em>empty</em>}
                    {isHabit(stack.tasks, task.id) && (
                      <span
                        className="habit-clock"
                        aria-label="Habit (resets at midnight)"
                        title="Habit — resets at midnight"
                      >
                        {" \u{1F550}"}
                      </span>
                    )}
                  </span>
                )}
              </li>
              {insertAfter && (
                <li
                  className={`task-row editing depth-${Math.min(depth, 8)}`}
                >
                  <span className="bullet">+</span>
                  <EditingInput
                    value={newTaskEditing!.draft}
                    placeholder="New task…"
                    onChange={(v) =>
                      dispatch({ type: "edit-draft", draft: v })
                    }
                    onCommit={() => dispatch({ type: "new-task-commit" })}
                    onCancel={() => dispatch({ type: "new-task-cancel" })}
                  />
                </li>
              )}
            </Fragment>
          );
        })}

        {flat.length === 0 && !newTaskEditing && (
          <li className="empty-tasks">
            Stack is empty — <Kbd>Ctrl+N</Kbd> to add the first task.
          </li>
        )}
      </ul>

      {contextMenu &&
        (() => {
          const inherited = isHabitInherited(stack.tasks, contextMenu.taskId);
          const on = isHabit(stack.tasks, contextMenu.taskId);
          const label = inherited
            ? "Habit (inherited from ancestor)"
            : on
              ? "Unmark as habit"
              : "Mark as habit";
          return (
            <Menu
              x={contextMenu.x}
              y={contextMenu.y}
              items={[
                { id: "toggle-habit", label, disabled: inherited },
              ]}
              onSelect={(id) => {
                if (id === "toggle-habit") {
                  dispatch({ type: "toggle-habit", taskId: contextMenu.taskId });
                }
              }}
              onClose={() => setContextMenu(null)}
            />
          );
        })()}
    </section>
  );
}
