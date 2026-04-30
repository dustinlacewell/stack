import { IconButton } from "../design";
import "./Titlebar.css";

type Props = {
  titleText: string;
  pinned: boolean;
  onOpenSettings: () => void;
  onTogglePin: () => void;
  onHide: () => void;
};

export function Titlebar({
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
        <IconButton title="Settings (Ctrl+,)" onClick={onOpenSettings}>
          ⚙
        </IconButton>
        <IconButton
          toggled={pinned}
          title={pinned ? "Pinned" : "Pin window (won't auto-hide)"}
          onClick={onTogglePin}
        >
          {pinned ? "📌" : "📍"}
        </IconButton>
        <IconButton large title="Hide" onClick={onHide}>
          ×
        </IconButton>
      </div>
    </div>
  );
}
