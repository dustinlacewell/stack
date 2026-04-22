// Aggregated app CSS for shadow DOM injection.
// Each file is imported as a raw string so Vite doesn't process it
// as a global stylesheet — it stays scoped inside the shadow root.

import tokens from "@app/design/tokens.css?raw";
import titlebar from "@app/app/Titlebar.css?raw";
import stackViewCss from "@app/app/StackView.css?raw";
import quickViewCss from "@app/app/QuickView.css?raw";
import stackListCss from "@app/components/StackList.css?raw";
import taskTreeCss from "@app/components/TaskTree.css?raw";
import editingInputCss from "@app/components/EditingInput.css?raw";
import buttonCss from "@app/design/primitives/Button.css?raw";
import iconButtonCss from "@app/design/primitives/IconButton.css?raw";
import kbdCss from "@app/design/primitives/Kbd.css?raw";
import menuCss from "@app/design/primitives/Menu.css?raw";
import dialogCss from "@app/design/primitives/Dialog.css?raw";
import chipCss from "@app/design/primitives/Chip.css?raw";
import stackSelectCss from "@app/components/StackSelect.css?raw";

// Remap :root → :host so custom properties scope to the shadow root
const scopedTokens = tokens.replace(/:root/g, ":host");

// Base styles that App.css normally sets on :root / body / .app.
// We reproduce only what the embedded components need.
const baseReset = `
:host {
  color-scheme: dark;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  color: var(--text);
  line-height: var(--leading-normal);
  text-align: left;
}

*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

select, input, button {
  font: inherit;
  color: inherit;
  color-scheme: dark;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  border: none;
}

.app-frame {
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--surface-4);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-window);
}

/* Re-enable pointer events for menu portals inside the portal container */
.portal-container .menu-scrim {
  pointer-events: auto;
}
`;

export const appStyles = [
  scopedTokens,
  baseReset,
  titlebar,
  stackViewCss,
  quickViewCss,
  stackListCss,
  taskTreeCss,
  editingInputCss,
  buttonCss,
  iconButtonCss,
  kbdCss,
  menuCss,
  dialogCss,
  chipCss,
  stackSelectCss,
].join("\n");
