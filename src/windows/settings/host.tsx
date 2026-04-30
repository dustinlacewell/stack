/**
 * Settings window — its own webview, hosts the keybindings + about UI.
 * Receives a `settings:show` snapshot of overrides + outcomes + tab; emits
 * `settings:response` on every override change so the main reducer + Rust
 * shortcut registrar stay synced.
 */

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { listen, emit } from "@tauri-apps/api/event";
import type { BindingOverrides } from "../../actions";
import type { RegistrationOutcome, SettingsTab } from "../../types";
import { Settings } from "../../components/Settings";
import type {
  SettingsResponse,
  ShowSettingsRequest,
} from "./types";
import "../../design/tokens.css";
import "./host.css";

function SettingsHost() {
  const [tab, setTab] = useState<SettingsTab>("keybindings");
  const [overrides, setOverridesLocal] = useState<BindingOverrides>({});
  const [outcomes, setOutcomes] = useState<RegistrationOutcome[]>([]);

  // Snapshots from main: overwrite local state. Local edits round-trip
  // through main (via set-overrides), so the snapshot we get back will
  // include our most recent change.
  useEffect(() => {
    const unlisten = listen<ShowSettingsRequest>("settings:show", (event) => {
      setTab(event.payload.tab);
      setOverridesLocal(event.payload.overrides);
      setOutcomes(event.payload.registrationOutcomes);
    });
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  // Esc → dismiss. Overrides every browser-level Esc behavior.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        respond({ kind: "dismiss" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const setOverrides = (
    updater: (prev: BindingOverrides) => BindingOverrides
  ) => {
    setOverridesLocal((prev) => {
      const next = updater(prev);
      void respond({ kind: "set-overrides", overrides: next });
      return next;
    });
  };

  const onSetTab = (next: SettingsTab) => {
    setTab(next);
    void respond({ kind: "set-tab", tab: next });
  };

  return (
    <Settings
      tab={tab}
      overrides={overrides}
      setOverrides={setOverrides}
      registrationOutcomes={outcomes}
      onSetTab={onSetTab}
      onExit={() => respond({ kind: "dismiss" })}
    />
  );
}

async function respond(response: SettingsResponse) {
  await emit("settings:response", response);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SettingsHost />
  </React.StrictMode>
);

