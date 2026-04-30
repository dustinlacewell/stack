import { useRef } from "react";

/**
 * Mirror of `value` into a mutable ref that always reflects the latest
 * render's value. Useful for callbacks attached once but needing fresh reads.
 */
export function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
