import { getStrengthFromString } from "@repo/crypto";
import { cn } from "@repo/ui/lib/utils";
import type { PasswordStrengthLevel } from "@repo/util";
import type { ReactNode } from "react";

const LEVELS: PasswordStrengthLevel[] = ["weak", "fair", "strong", "very-strong"];

// Each segment keeps its own hue; the meter fills red → green.
const SEGMENT_COLOR: Record<PasswordStrengthLevel, string> = {
  weak: "bg-strength-weak",
  fair: "bg-strength-fair",
  strong: "bg-strength-strong",
  "very-strong": "bg-strength-very-strong",
};

// Label takes the highest filled hue, darkened in light mode for contrast.
const LABEL_COLOR: Record<PasswordStrengthLevel, string> = {
  weak: "text-[#e11d48] dark:text-strength-weak",
  fair: "text-[#ea580c] dark:text-strength-fair",
  strong: "text-[#b07f00] dark:text-strength-strong",
  "very-strong": "text-[#059669] dark:text-strength-very-strong",
};

type PasswordStrengthMeterProps = {
  password: string;
  /** Right-aligned hint on the label row, e.g. a character count. */
  aside?: ReactNode;
  /** Segments only, no label row — for tight spots like the health panel. */
  compact?: boolean;
  className?: string;
};

/** Four fixed-color segments filling with the password's estimated strength. */
export default function PasswordStrengthMeter({
  password,
  aside,
  compact = false,
  className,
}: PasswordStrengthMeterProps) {
  const strength = password ? getStrengthFromString(password) : null;
  const filled = strength ? LEVELS.indexOf(strength.level) + 1 : 0;

  return (
    <div className={cn("flex flex-col gap-1.5", compact && "w-16", className)}>
      <div className={cn("grid grid-cols-4", compact ? "gap-1" : "gap-1.5")} aria-hidden>
        {LEVELS.map((level, i) => (
          <span
            key={level}
            className={cn(
              "h-1 rounded-full transition-colors",
              i < filled ? SEGMENT_COLOR[level] : "bg-foreground/10",
            )}
          />
        ))}
      </div>
      <div
        className={cn(
          "flex justify-between gap-2 text-muted-foreground text-xs",
          compact && "sr-only",
        )}
      >
        <span aria-live="polite">
          {strength ? (
            <>
              Strength:{" "}
              <span className={cn("font-semibold", LABEL_COLOR[strength.level])}>
                {strength.label}
              </span>
            </>
          ) : (
            " "
          )}
        </span>
        {aside}
      </div>
    </div>
  );
}
