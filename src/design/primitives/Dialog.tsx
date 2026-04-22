import type { ReactNode } from "react";
import "./Dialog.css";

type Props = {
  onDismiss: () => void;
  children: ReactNode;
};

export function Dialog({ onDismiss, children }: Props) {
  return (
    <div className="modal-scrim" onClick={onDismiss}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <div className="dialog-title">{children}</div>;
}

export function DialogBody({ children }: { children: ReactNode }) {
  return <div className="dialog-body">{children}</div>;
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="dialog-actions">{children}</div>;
}
