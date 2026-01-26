import * as React from "react";
import { cn } from "../utils/tailwind";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        /* ---------- Base styles ---------- */
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-3xl font-medium",
        "transition-colors focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",

        /* ---------- Size styles ---------- */
        {
          sm: "h-8 px-3 text-sm [&_svg]:text-xl",
          md: "h-10 px-4 text-sm [&_svg]:text-xl",
          lg: "h-12 px-6 text-base [&_svg]:text-2xl",
        }[size],

        /* ---------- Variant styles ---------- */
        {
          primary: [
            "bg-gradient",
            "focus-visible:ring-content-primary",
            "[&_svg]:text-content-inverted",
          ],
          secondary: ["bg-bg-2 border", "hover:bg-surface-4", "focus-visible:ring-primary-900"],
          ghost: ["bg-transparent", "hover:bg-surface-4", "focus-visible:ring-primary-900"],
          destructive: [
            "bg-error-surface text-error-content border-error-line border",
            "hover:bg-error-line",
            "focus-visible:ring-error-line",
            "[&_svg]:text-error-content",
          ],
        }[variant],

        className,
      )}
      {...props}
    />
  );
});
