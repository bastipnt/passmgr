import { Button } from "@repo/ui/components/Button";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

const TONES = {
  neutral: { icon: "bg-primary/10 text-primary-text", detail: "text-muted-foreground" },
  success: { icon: "bg-success/12 text-success", detail: "text-muted-foreground" },
  error: { icon: "bg-destructive/10 text-destructive", detail: "text-destructive" },
};

/** What an earlier step settled (a file, a recovery key), with Change to go back to it. */
export default function AuthChip({
  icon,
  tone,
  title,
  detail,
  onChange,
  disabled,
}: {
  icon: ReactNode;
  tone: keyof typeof TONES;
  title: ReactNode;
  detail: string;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-white/50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl [&>svg]:size-5",
          TONES[tone].icon,
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold text-sm">{title}</span>
        <span className={cn("truncate text-xs", TONES[tone].detail)}>{detail}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-primary-text max-sm:h-12"
        onClick={onChange}
        disabled={disabled}
      >
        Change
      </Button>
    </div>
  );
}
