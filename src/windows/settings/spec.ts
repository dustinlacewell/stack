import type { AppState } from "../../types";
import type { WindowSpec } from "../manager";
import type { SettingsResponse, ShowSettingsRequest } from "./types";

export const settingsSpec: WindowSpec<
  AppState,
  ShowSettingsRequest,
  SettingsResponse
> = {
  label: "settings",
  url: "/settings.html",
  options: {
    title: "Settings",
    transparent: false,
    decorations: true,
    skipTaskbar: true,
    width: 560,
    height: 620,
    resizable: true,
    focus: false,
    center: true,
  },
  desired: (state) =>
    state.presented === "settings"
      ? {
          visible: true,
          payload: {
            tab: state.settingsTab,
            overrides: state.overrides,
            registrationOutcomes: state.registrationOutcomes,
          },
        }
      : { visible: false },
  onResponse: (response) => {
    switch (response.kind) {
      case "set-overrides":
        return { type: "settings.set-overrides", overrides: response.overrides };
      case "set-tab":
        return { type: "settings.set-tab", tab: response.tab };
      case "dismiss":
        // Return to the stack window — settings is a long-form view, not a
        // transient palette, so dismissing it shouldn't drop the user out
        // of the app entirely.
        return { type: "present.set", window: "main" };
    }
  },
};
