import { useState, type Dispatch } from "react";
import type { ReducerAction } from "../reducer";
import type { AppState, Editing, StackId } from "../types";
import { Chip, IconButton, Menu } from "../design";
import { countOpenTasks } from "../tree";
import { EditingInput } from "./EditingInput";
import "./StackList.css";

type Props = {
  state: AppState;
  dispatch: Dispatch<ReducerAction>;
};

type DropPos = "before" | "after" | null;

type ContextMenu = {
  stackId: StackId;
  x: number;
  y: number;
};

export function StackList({ state, dispatch }: Props) {
  const { stacks, activeStackId, editing } = state;
  const [dragId, setDragId] = useState<StackId | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: StackId;
    pos: DropPos;
  } | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);

  const closeMenu = () => setMenu(null);

  return (
    <aside className="stack-list" aria-label="Stacks">
      <div className="col-header">
        <span>Stacks</span>
        <IconButton
          className="add-stack"
          title="New stack (Ctrl+S)"
          onClick={() => dispatch({ type: "new-stack-start" })}
        >
          +
        </IconButton>
      </div>
      <ul>
        {stacks.map((s) => {
          const isActive = s.id === activeStackId;
          const renameEditing =
            editing && editing.kind === "stack-name" && editing.stackId === s.id
              ? (editing as Extract<Editing, { kind: "stack-name" }>)
              : null;
          const isDragging = dragId === s.id;
          const showDropBefore =
            dropTarget?.id === s.id && dropTarget.pos === "before";
          const showDropAfter =
            dropTarget?.id === s.id && dropTarget.pos === "after";

          const classes = ["stack-row"];
          if (isActive) classes.push("active");
          if (isDragging) classes.push("dragging");
          if (showDropBefore) classes.push("drop-before");
          if (showDropAfter) classes.push("drop-after");

          return (
            <li
              key={s.id}
              className={classes.join(" ")}
              draggable={!renameEditing}
              onDragStart={(e) => {
                if (renameEditing) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", s.id);
                setDragId(s.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
              onDragOver={(e) => {
                if (!dragId || dragId === s.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                const pos: DropPos =
                  e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                if (dropTarget?.id !== s.id || dropTarget.pos !== pos) {
                  setDropTarget({ id: s.id, pos });
                }
              }}
              onDragLeave={(e) => {
                // Only clear when leaving the row entirely — dragover on
                // children would otherwise flicker the indicator.
                const related = e.relatedTarget as Node | null;
                if (!related || !e.currentTarget.contains(related)) {
                  setDropTarget((prev) =>
                    prev && prev.id === s.id ? null : prev
                  );
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const fromId = e.dataTransfer.getData("text/plain") as StackId;
                if (fromId && fromId !== s.id && dropTarget?.id === s.id) {
                  dispatch({
                    type: "reorder-stacks",
                    fromId,
                    toId: s.id,
                    before: dropTarget.pos === "before",
                  });
                }
                setDragId(null);
                setDropTarget(null);
              }}
              onClick={() =>
                !renameEditing &&
                dispatch({ type: "set-active-stack", stackId: s.id })
              }
              onDoubleClick={() => {
                dispatch({ type: "rename-stack-start", stackId: s.id });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ stackId: s.id, x: e.clientX, y: e.clientY });
              }}
            >
              {renameEditing ? (
                <EditingInput
                  value={renameEditing.draft}
                  onChange={(v) => dispatch({ type: "edit-draft", draft: v })}
                  onCommit={() => dispatch({ type: "edit-stack-commit" })}
                  onCancel={() => dispatch({ type: "edit-stack-cancel" })}
                />
              ) : (
                <span className="stack-name">{s.name || "Untitled"}</span>
              )}
              <Chip variant="count">{countOpenTasks(s.tasks)}</Chip>
            </li>
          );
        })}
        {editing && editing.kind === "new-stack" && (
          <li className="stack-row active">
            <EditingInput
              value={editing.draft}
              placeholder="New stack name…"
              onChange={(v) => dispatch({ type: "edit-draft", draft: v })}
              onCommit={() => dispatch({ type: "edit-stack-commit" })}
              onCancel={() => dispatch({ type: "edit-stack-cancel" })}
            />
          </li>
        )}
        {stacks.length === 0 && !editing && (
          <li className="empty-stacks">No stacks yet. Click + to create one.</li>
        )}
      </ul>

      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          items={[
            { id: "rename", label: "Rename" },
            { separator: true },
            { id: "delete", label: "Delete", danger: true },
          ]}
          onSelect={(id) => {
            if (id === "rename")
              dispatch({ type: "rename-stack-start", stackId: menu.stackId });
            if (id === "delete")
              dispatch({ type: "request-delete-stack", stackId: menu.stackId });
          }}
          onClose={closeMenu}
        />
      )}
    </aside>
  );
}

