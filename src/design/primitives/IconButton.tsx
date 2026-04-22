import type { ButtonHTMLAttributes } from "react";
import "./IconButton.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  toggled?: boolean;
  large?: boolean;
};

export function IconButton({
  toggled,
  large,
  className,
  ...rest
}: Props) {
  const classes = ["icon-btn"];
  if (toggled) classes.push("toggled");
  if (large) classes.push("large");
  if (className) classes.push(className);
  return <button className={classes.join(" ")} {...rest} />;
}
