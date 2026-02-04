import { cn } from "../utils/cn";
import type { ButtonSize, ButtonVariant } from "./Button";
import { Link, type LinkProps } from "wouter";
import styles from "./Button.module.css";

type ButtonLinkProps = {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} & Omit<LinkProps, "href" | "to" | "asChild">;

export default function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={cn(styles.button, styles[size], styles[variant], className)} {...props} />
  );
}
