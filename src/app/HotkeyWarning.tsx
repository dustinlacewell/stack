import "./HotkeyWarning.css";

type Props = {
  onClick: () => void;
};

export function HotkeyWarning({ onClick }: Props) {
  return (
    <button
      className="hotkey-warning"
      onClick={onClick}
      title="One or more global shortcuts couldn't register. Open Settings to fix."
    >
      ⚠ Global shortcuts inactive — click to review
    </button>
  );
}
