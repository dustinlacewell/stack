/**
 * Public surface of the windows layer. App.tsx reaches in via this file
 * only — the manager and the WINDOWS array are the integration points.
 */

import { searchSpec } from "./search/spec";
import { portalSpec } from "./portal/spec";
import { quickSpec } from "./quick/spec";
import { settingsSpec } from "./settings/spec";
import type { AppState } from "../types";
import type { WindowSpec } from "./manager";

// Order is irrelevant for behavior — but the manager iterates this list
// every reconcile pass, so keeping declaration grouped (palettes first,
// overlay last) keeps tracing cheap.
export const WINDOWS: WindowSpec<AppState, any, any>[] = [
  quickSpec,
  searchSpec,
  settingsSpec,
  portalSpec,
];

export { createWindowManager, type WindowManager, type WindowSpec } from "./manager";
