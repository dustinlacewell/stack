import { useEffect, useRef } from "react";
import "./EditingInput.css";

type Props = {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  commitOnBlur?: boolean;
};

export function EditingInput({
  value,
  placeholder,
  onChange,
  onCommit,
  onCancel,
  commitOnBlur = true,
}: Props) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="editing-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.currentTarget.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onCommit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        } else if (e.key === "Tab") {
          e.preventDefault();
        }
      }}
      onBlur={() => {
        if (commitOnBlur) onCommit();
      }}
    />
  );
}
