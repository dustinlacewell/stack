export type KeyCombo = {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
};

// Normalize the physical key for comparison. Keeps arrows / Enter / Tab / Escape
// as their named values, letter keys as lowercase, digits as-is.
export function normalizeKey(key: string): string {
  if (key.length === 1) return key.toLowerCase();
  return key;
}

export function eventToCombo(e: KeyboardEvent | React.KeyboardEvent): KeyCombo {
  return {
    key: normalizeKey(e.key),
    ctrl: e.ctrlKey || undefined,
    alt: e.altKey || undefined,
    shift: e.shiftKey || undefined,
    meta: e.metaKey || undefined,
  };
}

export function combosEqual(a: KeyCombo, b: KeyCombo): boolean {
  return (
    a.key === b.key &&
    !!a.ctrl === !!b.ctrl &&
    !!a.alt === !!b.alt &&
    !!a.shift === !!b.shift &&
    !!a.meta === !!b.meta
  );
}

export function formatCombo(c: KeyCombo): string {
  const parts: string[] = [];
  if (c.ctrl) parts.push("Ctrl");
  if (c.alt) parts.push("Alt");
  if (c.shift) parts.push("Shift");
  if (c.meta) parts.push("Meta");
  parts.push(displayKey(c.key));
  return parts.join("+");
}

function displayKey(key: string): string {
  switch (key) {
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    case " ":
      return "Space";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

// Tauri-plugin-global-shortcut accepts Electron-style accelerator strings.
export function comboToAccelerator(c: KeyCombo): string {
  const parts: string[] = [];
  if (c.ctrl) parts.push("Control");
  if (c.alt) parts.push("Alt");
  if (c.shift) parts.push("Shift");
  if (c.meta) parts.push("Super");
  parts.push(accelKey(c.key));
  return parts.join("+");
}

function accelKey(key: string): string {
  if (key === "ArrowUp") return "Up";
  if (key === "ArrowDown") return "Down";
  if (key === "ArrowLeft") return "Left";
  if (key === "ArrowRight") return "Right";
  if (key.length === 1) return key.toUpperCase();
  return key;
}
