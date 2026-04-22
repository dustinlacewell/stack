import { useEffect, useMemo, useState } from "react";
import {
  ACTIONS,
  ACTIONS_BY_ID,
  claimCombo,
  getBindings,
  primaryScope,
  type ActionDef,
  type ActionId,
  type BindingOverrides,
  type Scope,
} from "../actions";
import { combosEqual, eventToCombo, formatCombo, type KeyCombo } from "../keys";
import type { SettingsTab } from "../types";
import { Button, Chip, Kbd } from "../design";
import { ConfirmDialog } from "./ConfirmDialog";
import "./Settings.css";

export type RegistrationOutcome = {
  action: ActionId;
  accel: string;
  succeeded: boolean;
  fallback: boolean;
};

type Props = {
  tab: SettingsTab;
  overrides: BindingOverrides;
  setOverrides: (updater: (prev: BindingOverrides) => BindingOverrides) => void;
  registrationOutcomes: RegistrationOutcome[];
  onSetTab: (tab: SettingsTab) => void;
  onExit: () => void;
};

export function Settings({
  tab,
  overrides,
  setOverrides,
  registrationOutcomes,
  onSetTab,
  onExit,
}: Props) {
  return (
    <div className="settings">
      <div className="settings-tabs">
        <button
          className={`settings-tab ${tab === "keybindings" ? "active" : ""}`}
          onClick={() => onSetTab("keybindings")}
        >
          Keybindings
        </button>
        <button
          className={`settings-tab ${tab === "about" ? "active" : ""}`}
          onClick={() => onSetTab("about")}
        >
          About
        </button>
        <div className="flex-spacer" />
        <Button variant="ghost" className="settings-done" onClick={onExit}>
          Done <Kbd>Esc</Kbd>
        </Button>
      </div>

      <div className="settings-body">
        {tab === "keybindings" ? (
          <KeybindingsTab
            overrides={overrides}
            setOverrides={setOverrides}
            registrationOutcomes={registrationOutcomes}
          />
        ) : (
          <AboutTab />
        )}
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="about">
      <h2>Stack</h2>
      <p className="about-line">A one-key reach for “what am I doing.”</p>
      <p className="about-line dim">v0.1.0 · Tauri + React</p>
    </div>
  );
}

const SCOPE_ORDER: Scope[] = [
  "global-os",
  "global",
  "list",
  "edit",
  "quick",
  "settings",
  "modal",
];

const SCOPE_LABEL: Record<Scope, string> = {
  "global-os": "OS-wide (global shortcuts)",
  global: "Window (always-active)",
  list: "Stack & task navigation",
  edit: "While editing a task / stack name",
  quick: "Quick-add",
  settings: "Settings screen",
  modal: "Confirmation dialogs",
};

type KeybindingsProps = {
  overrides: BindingOverrides;
  setOverrides: (updater: (prev: BindingOverrides) => BindingOverrides) => void;
  registrationOutcomes: RegistrationOutcome[];
};

type PendingClaim = {
  actionId: ActionId;
  combo: KeyCombo;
  stealing: ActionId[];
};

function KeybindingsTab({
  overrides,
  setOverrides,
  registrationOutcomes,
}: KeybindingsProps) {
  const [recordingFor, setRecordingFor] = useState<ActionId | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [pendingClaim, setPendingClaim] = useState<PendingClaim | null>(null);
  const hasOverrides = Object.keys(overrides).length > 0;

  const grouped = useMemo(() => {
    const m = new Map<Scope, ActionDef[]>();
    for (const sc of SCOPE_ORDER) m.set(sc, []);
    for (const a of ACTIONS) m.get(primaryScope(a))!.push(a);
    return m;
  }, []);

  const conflictsByAction = useMemo(() => {
    const scopesOf = (a: ActionDef): Scope[] =>
      Array.isArray(a.scope) ? a.scope : [a.scope];
    const result = new Map<ActionId, Set<string>>();
    for (const a of ACTIONS) {
      const aScopes = new Set(scopesOf(a));
      const aBindings = getBindings(a.id, overrides);
      const clashes = new Set<string>();
      for (const b of ACTIONS) {
        if (b.id === a.id) continue;
        const shared = scopesOf(b).some((s) => aScopes.has(s));
        if (!shared) continue;
        const bBindings = getBindings(b.id, overrides);
        for (const ac of aBindings) {
          if (bBindings.some((bc) => formatCombo(ac) === formatCombo(bc))) {
            clashes.add(formatCombo(ac));
          }
        }
      }
      if (clashes.size > 0) result.set(a.id, clashes);
    }
    return result;
  }, [overrides]);

  const fallbackByAction = useMemo(() => {
    const m = new Map<ActionId, RegistrationOutcome[]>();
    for (const o of registrationOutcomes) {
      if (!o.fallback || !o.succeeded) continue;
      const arr = m.get(o.action) ?? [];
      arr.push(o);
      m.set(o.action, arr);
    }
    return m;
  }, [registrationOutcomes]);

  const failuresByAction = useMemo(() => {
    const m = new Map<ActionId, RegistrationOutcome[]>();
    for (const o of registrationOutcomes) {
      if (o.succeeded) continue;
      const arr = m.get(o.action) ?? [];
      arr.push(o);
      m.set(o.action, arr);
    }
    return m;
  }, [registrationOutcomes]);

  const anyFailures = failuresByAction.size > 0;
  const anyFallbacks = fallbackByAction.size > 0;

  // Global keydown while recording; captures the next non-modifier keystroke.
  // Bare combos (no modifiers) that collide with another action in an
  // overlapping scope are routed through a confirmation dialog — we tell the
  // user whose combo they're about to steal before we actually strip it.
  useEffect(() => {
    if (!recordingFor) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingFor(null);
        return;
      }
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      const combo = eventToCombo(e);
      const stealing = findStealTargets(recordingFor, combo, overrides);
      if (stealing.length > 0) {
        setPendingClaim({ actionId: recordingFor, combo, stealing });
        setRecordingFor(null);
        return;
      }
      setOverrides((prev) => claimCombo(prev, recordingFor, [combo]));
      setRecordingFor(null);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [recordingFor, overrides, setOverrides]);

  const reset = (id: ActionId) =>
    setOverrides((prev) => {
      const { [id]: _removed, ...rest } = prev;
      void _removed;
      return rest;
    });

  const clear = (id: ActionId) =>
    setOverrides((prev) => ({ ...prev, [id]: [] }));

  return (
    <div className="keybindings">
      <div className="keybindings-toolbar">
        <div className="keybindings-note">
          Overrides persist to disk. If a global shortcut fails to register,
          defaults are used as a fallback so you can always summon the window.
        </div>
        {resetConfirm ? (
          <div className="reset-confirm">
            <span>Reset all overrides?</span>
            <Button
              size="tiny"
              variant="danger"
              onClick={() => {
                setOverrides(() => ({}));
                setResetConfirm(false);
              }}
            >
              Reset all
            </Button>
            <Button
              size="tiny"
              variant="ghost"
              onClick={() => setResetConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="tiny"
            onClick={() => setResetConfirm(true)}
            disabled={!hasOverrides}
          >
            Reset all to defaults
          </Button>
        )}
      </div>

      {(anyFailures || anyFallbacks) && (
        <div className="registration-banner">
          {anyFailures && (
            <div className="registration-line error">
              Some global shortcuts couldn't register (OS-reserved or taken by
              another app).
            </div>
          )}
          {anyFallbacks && (
            <div className="registration-line warn">
              Falling back to defaults for some actions — see the rows marked{" "}
              <span className="fallback-chip">fallback</span> below.
            </div>
          )}
        </div>
      )}

      {pendingClaim && (
        <ConfirmDialog
          title="Reassign shortcut?"
          body={`${formatCombo(pendingClaim.combo)} is currently bound to ${pendingClaim.stealing
            .map((id) => `“${ACTIONS_BY_ID[id].description}”`)
            .join(", ")}. Assigning it to “${
            ACTIONS_BY_ID[pendingClaim.actionId].description
          }” will unbind ${pendingClaim.stealing.length === 1 ? "it" : "them"}.`}
          confirmLabel="Reassign"
          onConfirm={() => {
            const { actionId, combo } = pendingClaim;
            setOverrides((prev) => claimCombo(prev, actionId, [combo]));
            setPendingClaim(null);
          }}
          onCancel={() => setPendingClaim(null)}
        />
      )}

      {SCOPE_ORDER.map((sc) => {
        const list = grouped.get(sc) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={sc} className="scope-section">
            <h3 className="scope-header">{SCOPE_LABEL[sc]}</h3>
            <div className="binding-rows">
              {list.map((a) => {
                const bindings = getBindings(a.id, overrides);
                const isRecording = recordingFor === a.id;
                const isOverridden = a.id in overrides;
                const clashes = conflictsByAction.get(a.id);
                const fallbacks = fallbackByAction.get(a.id);
                const failures = failuresByAction.get(a.id);
                return (
                  <div key={a.id} className="binding-row">
                    <div className="binding-meta">
                      <div className="binding-title">{a.description}</div>
                      <div className="binding-id">{a.id}</div>
                    </div>
                    <div className="binding-combos">
                      {isRecording ? (
                        <span className="recording">
                          Press a key… <Kbd>Esc</Kbd> to cancel
                        </span>
                      ) : bindings.length === 0 ? (
                        <span className="binding-empty">unbound</span>
                      ) : (
                        bindings.map((c, i) => (
                          <ComboChip
                            key={i}
                            combo={c}
                            conflict={clashes?.has(formatCombo(c))}
                            failed={
                              !!failures?.find((f) => f.accel.endsWith(toAccelTail(c)))
                            }
                          />
                        ))
                      )}
                      {fallbacks && fallbacks.length > 0 && (
                        <span
                          className="fallback-chip"
                          title="Override failed; default is in effect"
                        >
                          fallback: {fallbacks.map((f) => f.accel).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="binding-actions">
                      <Button
                        size="tiny"
                        onClick={() =>
                          setRecordingFor(isRecording ? null : a.id)
                        }
                      >
                        {isRecording ? "Cancel" : "Record"}
                      </Button>
                      <Button
                        size="tiny"
                        variant="ghost"
                        onClick={() => clear(a.id)}
                        title="Unbind"
                      >
                        Unbind
                      </Button>
                      <Button
                        size="tiny"
                        variant="ghost"
                        onClick={() => reset(a.id)}
                        disabled={!isOverridden}
                        title="Reset to default"
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}


// Which other actions currently answer to `combo` in a scope shared with
// `actionId`? Mirrors the scope-intersection logic inside claimCombo so the
// UI and the writer agree on what "collision" means.
function findStealTargets(
  actionId: ActionId,
  combo: KeyCombo,
  overrides: BindingOverrides
): ActionId[] {
  const claimer = ACTIONS_BY_ID[actionId];
  const claimerScopes = new Set(
    Array.isArray(claimer.scope) ? claimer.scope : [claimer.scope]
  );
  const result: ActionId[] = [];
  for (const other of ACTIONS) {
    if (other.id === actionId) continue;
    const otherScopes = Array.isArray(other.scope) ? other.scope : [other.scope];
    if (!otherScopes.some((s) => claimerScopes.has(s))) continue;
    const bindings = getBindings(other.id, overrides);
    if (bindings.some((b) => combosEqual(b, combo))) {
      result.push(other.id);
    }
  }
  return result;
}

function toAccelTail(combo: KeyCombo): string {
  // Rough match: the accel string ends with the key portion. Cheap compare.
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Control");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push("Shift");
  if (combo.meta) parts.push("Super");
  parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  return parts.join("+");
}

function ComboChip({
  combo,
  conflict,
  failed,
}: {
  combo: KeyCombo;
  conflict?: boolean;
  failed?: boolean;
}) {
  const variant = failed ? "danger" : conflict ? "conflict" : "default";
  return (
    <Chip
      variant={variant}
      title={
        failed
          ? "This combo failed to register with the OS"
          : conflict
            ? "Conflicts with another action in this scope"
            : undefined
      }
    >
      {formatCombo(combo)}
    </Chip>
  );
}
