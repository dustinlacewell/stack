import { Store } from "@tauri-apps/plugin-store";
import { info, warn } from "@tauri-apps/plugin-log";
import type { BindingOverrides } from "./actions";
import type { AppState, Stack, WindowSize } from "./types";

// Persistence lives on disk under `app_config_dir` (Windows:
// %APPDATA%\com.dustin.stack\stack.json), not in the webview's localStorage.
// That directory survives WebView2 resets, dev→release profile switches, and
// anything else that would otherwise feel like a fresh install.
const FILE = "stack.json";
const STATE_KEY = "state";
const BINDINGS_KEY = "bindings";

// One-time migration from the old localStorage-backed persistence. Read-only;
// we don't clear the old keys in case the user wants to roll back.
const LEGACY_STATE_KEY = "stack.state.v2";
const LEGACY_BINDINGS_KEY = "stack.bindings.v1";

export type PersistedState = {
  stacks: Stack[];
  activeStackId: string | null;
  pinned: boolean;
  stackViewSize: WindowSize | null;
  lastHabitResetDate: string | null;
};

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  if (!storePromise) {
    info(`storage: loading ${FILE}`);
    storePromise = Store.load(FILE, { defaults: {}, autoSave: true }).then(
      async (store) => {
        info(`storage: ${FILE} loaded`);
        await migrateFromLocalStorage(store);
        return store;
      },
      (err) => {
        warn(`storage: load failed: ${err}`);
        throw err;
      }
    );
  }
  return storePromise;
}

async function migrateFromLocalStorage(store: Store): Promise<void> {
  try {
    if (!(await store.has(STATE_KEY))) {
      const legacy = readLegacyState();
      if (legacy) await store.set(STATE_KEY, legacy);
    }
    if (!(await store.has(BINDINGS_KEY))) {
      const legacy = readLegacyBindings();
      if (legacy) await store.set(BINDINGS_KEY, legacy);
    }
  } catch (err) {
    console.warn("legacy migration skipped", err);
  }
}

function readLegacyState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(LEGACY_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.stacks)) return null;
    return parsed as PersistedState;
  } catch {
    return null;
  }
}

function readLegacyBindings(): BindingOverrides | null {
  try {
    const raw = localStorage.getItem(LEGACY_BINDINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadState(): Promise<PersistedState | null> {
  try {
    const store = await getStore();
    const val = await store.get<Partial<PersistedState>>(STATE_KEY);
    if (!val || !Array.isArray(val.stacks)) return null;
    // Forward-compat: older stores predate stackViewSize.
    return {
      stacks: val.stacks,
      activeStackId: val.activeStackId ?? null,
      pinned: val.pinned ?? false,
      stackViewSize: val.stackViewSize ?? null,
      lastHabitResetDate: val.lastHabitResetDate ?? null,
    };
  } catch (err) {
    console.warn("loadState failed", err);
    return null;
  }
}

export async function saveState(s: AppState): Promise<void> {
  try {
    const snapshot: PersistedState = {
      stacks: s.stacks,
      activeStackId: s.activeStackId,
      pinned: s.pinned,
      stackViewSize: s.stackViewSize,
      lastHabitResetDate: s.lastHabitResetDate,
    };
    const store = await getStore();
    await store.set(STATE_KEY, snapshot);
  } catch (err) {
    console.warn("saveState failed", err);
  }
}

export async function loadBindings(): Promise<BindingOverrides> {
  try {
    const store = await getStore();
    const val = await store.get<BindingOverrides>(BINDINGS_KEY);
    return val && typeof val === "object" ? val : {};
  } catch (err) {
    console.warn("loadBindings failed", err);
    return {};
  }
}

export async function saveBindings(
  overrides: BindingOverrides
): Promise<void> {
  try {
    const store = await getStore();
    await store.set(BINDINGS_KEY, overrides);
  } catch (err) {
    console.warn("saveBindings failed", err);
  }
}
