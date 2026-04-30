import type { BindingOverrides } from "../../actions";
import type {
  RegistrationOutcome,
  SettingsTab,
} from "../../types";

// main → settings.
export type ShowSettingsRequest = {
  tab: SettingsTab;
  overrides: BindingOverrides;
  registrationOutcomes: RegistrationOutcome[];
};

// settings → main.
export type SettingsResponse =
  | { kind: "set-overrides"; overrides: BindingOverrides }
  | { kind: "set-tab"; tab: SettingsTab }
  | { kind: "dismiss" };
