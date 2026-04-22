import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
  Kbd,
} from "../design";

type Props = {
  title: string;
  body: string;
  destructive?: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  body,
  destructive,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog onDismiss={onCancel}>
      <DialogTitle>{title}</DialogTitle>
      <DialogBody>{body}</DialogBody>
      <DialogActions>
        <Button variant="ghost" onClick={onCancel}>
          Cancel <Kbd>Esc</Kbd>
        </Button>
        <Button
          variant={destructive ? "danger" : "primary"}
          onClick={onConfirm}
          autoFocus
        >
          {confirmLabel} <Kbd>Enter</Kbd>
        </Button>
      </DialogActions>
    </Dialog>
  );
}
