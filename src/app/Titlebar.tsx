import type { View } from "../types";
import { IconButton } from "../design";
import "./Titlebar.css";

type Props = {
  view: View;
  titleText: string;
  pinned: boolean;
  onOpenSettings: () => void;
  onTogglePin: () => void;
  onHide: () => void;
};

export function Titlebar({
  view,
  titleText,
  pinned,
  onOpenSettings,
  onTogglePin,
  onHide,
}: Props) {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="title" data-tauri-drag-region>
        <span className="dot" />
        <span className="headline" data-tauri-drag-region>
          {titleText}
        </span>
      </div>
      <div className="controls">
        {view.kind === "stack" && (
          <IconButton
            title="Settings (Ctrl+,)"
            onClick={onOpenSettings}
          >
            ⚙
          </IconButton>
        )}
        {view.kind !== "quick" && (
          <IconButton
            toggled={pinned}
            title={pinned ? "Pinned" : "Pin window (won't auto-hide)"}
            onClick={onTogglePin}
          >
            {pinned ? "📌" : "📍"}
          </IconButton>
        )}
        <IconButton large title="Hide" onClick={onHide}>
          ×
        </IconButton>
      </div>
    </div>
  );
}
