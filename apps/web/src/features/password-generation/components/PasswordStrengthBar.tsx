import { cn } from "@repo/ui/lib/utils";
import type { PasswordStrengthLevel } from "@repo/util";

const LEVEL_COLOR: Record<PasswordStrengthLevel, string> = {
  weak: "bg-destructive",
  fair: "bg-amber-500",
  strong: "bg-emerald-500",
  "very-strong": "bg-emerald-600",
};

type Props = {
  level: PasswordStrengthLevel;
  label: string;
  bits: number;
  className?: string;
};

export function PasswordStrengthBar({ level, label, bits, className }: Props) {
  const pct = Math.min(100, bits);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="bg-input h-1 flex-1 overflow-hidden rounded-full">
        <div
          className={cn("h-full transition-all", LEVEL_COLOR[level])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
        {label} · {Math.round(bits)} bits
      </span>
    </div>
  );
}
