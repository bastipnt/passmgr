import { Button } from "@repo/ui/components/Button";
import { CardContent } from "@repo/ui/components/Card";
import { cn } from "@repo/ui/lib/utils";
import { ChevronLeftIcon } from "lucide-react";

/** A card's top row: Back, and where a flow has two steps, which one this is. */
export default function StepBar({
  onBack,
  step,
  disabled,
}: {
  onBack?: () => void;
  /** Absent when there is only one step. */
  step?: 1 | 2;
  disabled: boolean;
}) {
  return (
    <CardContent className="flex min-h-8 items-center justify-between">
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2.5 text-muted-foreground max-sm:h-12 max-sm:text-sm"
          onClick={onBack}
          disabled={disabled}
        >
          <ChevronLeftIcon data-icon="inline-start" />
          Back
        </Button>
      ) : (
        <span />
      )}
      {step && (
        <p className="flex items-center gap-2.5 text-muted-foreground text-xs">
          Step {step} of 2
          <span aria-hidden className="flex gap-1">
            {[1, 2].map((n) => (
              <span
                key={n}
                className={cn(
                  "h-1 w-5 rounded-full",
                  n <= step ? "bg-primary" : "bg-foreground/15",
                )}
              />
            ))}
          </span>
        </p>
      )}
    </CardContent>
  );
}
