import { usePasswordStrength } from "@repo/client";
import { cn } from "@repo/ui/lib/utils";
import type { PasswordStrength, PasswordStrengthLevel } from "@repo/util";
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
  weak: "text-[#be123c] dark:text-strength-weak",
  fair: "text-[#c2410c] dark:text-strength-fair",
  strong: "text-[#8a6300] dark:text-strength-strong",
  "very-strong": "text-[#047857] dark:text-strength-very-strong",
};

type PasswordStrengthMeterProps = (
  | {
      password: string;
      /** Words the password shouldn't lean on, e.g. the account email. */
      userInputs?: string[];
      strength?: never;
    }
  | { strength: PasswordStrength | null; password?: never; userInputs?: never }
) & {
  /** Right-aligned hint on the label row, e.g. a character count. */
  aside?: ReactNode;
  /** Short segments with the label beside them in one line, `aside` at its end; no warning. */
  inline?: boolean;
  className?: string;
};

/** Four fixed-color segments filling with the password's estimated strength. */
export default function PasswordStrengthMeter({
  password,
  userInputs,
  strength: givenStrength,
  aside,
  inline = false,
  className,
}: PasswordStrengthMeterProps) {
  const ownStrength = usePasswordStrength(
    givenStrength === undefined ? password : undefined,
    userInputs,
  );
  const strength = givenStrength === undefined ? ownStrength : givenStrength;
  const filled = strength ? LEVELS.indexOf(strength.level) + 1 : 0;
  const segments = (
    <div className={cn("grid grid-cols-4", inline ? "w-16 gap-1" : "gap-1.5")} aria-hidden>
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
  );

  if (inline) {
    return (
      <div className={cn("flex items-center gap-2.5", className)}>
        {segments}
        <span
          aria-live="polite"
          className={cn(
            "font-semibold",
            strength ? LABEL_COLOR[strength.level] : "text-muted-foreground",
          )}
        >
          <span className="sr-only">Strength: </span>
          {strength ? strength.label : "Checking…"}
        </span>
        {aside && <span className="ml-auto text-muted-foreground">{aside}</span>}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {segments}
      <div className="flex justify-between gap-2 text-muted-foreground text-xs">
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
      {strength?.warning && <p className="text-muted-foreground text-xs">{strength.warning}</p>}
    </div>
  );
}
