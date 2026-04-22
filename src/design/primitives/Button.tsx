import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

type Variant = "default" | "primary" | "danger" | "ghost";
type Size = "normal" | "tiny";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "default",
  size = "normal",
  className,
  ...rest
}: Props) {
  const classes = ["btn"];
  if (variant !== "default") classes.push(variant);
  if (size === "tiny") classes.push("tiny");
  if (className) classes.push(className);
  return <button className={classes.join(" ")} {...rest} />;
}
