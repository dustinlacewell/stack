/**
 * Search window — floats above the main window, hosts fuzzy search across
 * stacks and tasks. Receives a stacks snapshot via `search:show` and emits
 * `search:response` on selection or dismiss.
 */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import ReactDOM from "react-dom/client";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SearchResponse, SearchSelection, ShowSearchRequest } from "./types";
import type { Stack, StackId, Task, TaskId } from "../../types";
import { fuzzyScore, highlight, type HighlightSegment } from "./fuzzy";
import "../../design/tokens.css";
import "./host.css";

// Flat searchable record — one per stack (kind=stack) and one per task.
// `crumbs` is the ancestor chain inside the stack, excluding the task itself.
// The stack name is rendered separately, never duplicated in crumbs.
type Candidate =
  | { kind: "stack"; stackId: StackId; name: string }
  | {
      kind: "task";
      stackId: StackId;
      taskId: TaskId;
      stackName: string;
      text: string;
      crumbs: string[];
    };

type Scored = {
  cand: Candidate;
  score: number;
  indices: number[]; // into the primary label (stack name or task text)
};

const MAX_RESULTS = 40;

function buildIndex(stacks: Stack[]): Candidate[] {
  const out: Candidate[] = [];
  for (const stack of stacks) {
    out.push({ kind: "stack", stackId: stack.id, name: stack.name });
    const walk = (tasks: Task[], crumbs: string[]) => {
      for (const t of tasks) {
        out.push({
          kind: "task",
          stackId: stack.id,
          taskId: t.id,
          stackName: stack.name,
          text: t.text,
          crumbs,
        });
        if (t.children.length > 0) {
          walk(t.children, [...crumbs, t.text]);
        }
      }
    };
    walk(stack.tasks, []);
  }
  return out;
}

function primaryLabel(c: Candidate): string {
  return c.kind === "stack" ? c.name : c.text;
}

function search(index: Candidate[], query: string): Scored[] {
  if (!query.trim()) return [];
  const scored: Scored[] = [];
  for (const cand of index) {
    const m = fuzzyScore(query, primaryLabel(cand));
    if (!m) continue;
    // Stacks get a small nudge so exact stack-name matches beat long task
    // text matches of similar score. Keeps "Work" finding the stack first.
    const bonus = cand.kind === "stack" ? 4 : 0;
    scored.push({ cand, score: m.score + bonus, indices: m.indices });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS);
}

function SearchHost() {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const dismiss = () => respond({ kind: "dismiss" });

  // Listen for snapshots from main. Reset input + selection on each show.
  useEffect(() => {
    const unlisten = listen<ShowSearchRequest>("search:show", (event) => {
      setStacks(event.payload.stacks);
      setQuery("");
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  // Blur → dismiss.
  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenTauri = win.onFocusChanged(({ payload: focused }) => {
      if (!focused) dismiss();
    });
    window.addEventListener("blur", dismiss);
    return () => {
      unlistenTauri.then((u) => u());
      window.removeEventListener("blur", dismiss);
    };
  }, []);

  // Escape → dismiss. (Enter/arrows handled on the input below to prevent
  // default text-caret behaviors.)
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const index = useMemo(() => buildIndex(stacks), [stacks]);
  const results = useMemo(() => search(index, query), [index, query]);

  // Clamp selection as results change.
  useEffect(() => {
    if (selectedIdx >= results.length) setSelectedIdx(0);
  }, [results, selectedIdx]);

  // Keep selected row visible.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${selectedIdx}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const commitSelection = (idx: number) => {
    const r = results[idx];
    if (!r) return;
    const selection: SearchSelection =
      r.cand.kind === "stack"
        ? { kind: "stack", stackId: r.cand.stackId }
        : {
            kind: "task",
            stackId: r.cand.stackId,
            taskId: r.cand.taskId,
          };
    respond({ kind: "select", selection });
  };

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitSelection(selectedIdx);
    }
  };

  return (
    <div className="search">
      <div className="search-input-row">
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search stacks and tasks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          autoFocus
        />
      </div>
      <div className="search-body" ref={listRef}>
        {stacks.length === 0 ? (
          <div className="search-empty">No stacks to search.</div>
        ) : !query.trim() ? (
          <div className="search-empty">Type to search.</div>
        ) : results.length === 0 ? (
          <div className="search-empty">No matches.</div>
        ) : (
          results.map((r, i) => (
            <ResultRow
              key={resultKey(r.cand)}
              idx={i}
              selected={i === selectedIdx}
              label={primaryLabel(r.cand)}
              indices={r.indices}
              cand={r.cand}
              onHover={() => setSelectedIdx(i)}
              onClick={() => commitSelection(i)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function resultKey(c: Candidate): string {
  return c.kind === "stack" ? `s:${c.stackId}` : `t:${c.stackId}:${c.taskId}`;
}

function ResultRow(props: {
  idx: number;
  selected: boolean;
  label: string;
  indices: number[];
  cand: Candidate;
  onHover: () => void;
  onClick: () => void;
}) {
  const segs = highlight(props.label, props.indices);
  const breadcrumb =
    props.cand.kind === "task"
      ? [props.cand.stackName, ...props.cand.crumbs]
      : null;

  return (
    <div
      className={`search-row${props.selected ? " selected" : ""}`}
      data-idx={props.idx}
      onMouseMove={props.onHover}
      onClick={props.onClick}
      role="option"
      aria-selected={props.selected}
    >
      <div className="search-row-main">
        <span className={`search-kind kind-${props.cand.kind}`}>
          {props.cand.kind === "stack" ? "stack" : "task"}
        </span>
        <span className="search-label">
          {segs.map((s: HighlightSegment, i: number) =>
            s.match ? (
              <mark key={i}>{s.text}</mark>
            ) : (
              <span key={i}>{s.text}</span>
            )
          )}
        </span>
      </div>
      {breadcrumb && breadcrumb.length > 0 && (
        <div className="search-crumbs">
          {breadcrumb.map((c, i) => (
            <span key={i} className="crumb">
              {c || <em>empty</em>}
              {i < breadcrumb.length - 1 && <span className="sep">›</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Emit only — visibility and main-window focus are owned by the
// main-side window manager, driven from the reducer's view state.
async function respond(response: SearchResponse) {
  await emit("search:response", response);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SearchHost />
  </React.StrictMode>
);
