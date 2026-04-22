import type { HTMLAttributes, ReactNode } from "react";
import "./Chip.css";

type Variant = "default" | "count" | "warn" | "danger" | "conflict";

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant;
  children: ReactNode;
};

export function Chip({ variant = "default", className, children, ...rest }: Props) {
  const classes = ["chip"];
  if (variant !== "default") classes.push(variant);
  if (className) classes.push(className);
  return (
    <span className={classes.join(" ")} {...rest}>
      {children}
    </span>
  );
}
