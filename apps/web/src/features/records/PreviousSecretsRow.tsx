import type { PreviousSecret } from "@repo/client";
import { cn } from "@repo/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";
import FieldDisplay from "./FieldDisplay";
import { useCopyField } from "./record-utils";

/** The values a secret field held before, folded into one row with their count and latest date. */
export function PreviousSecretsRow({
  previous,
  title,
}: {
  previous: PreviousSecret[];
  title: string;
}) {
  const copyField = useCopyField();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const [latest] = previous;
  if (!latest) return null;

  return (
    <div data-slot="previous-secrets">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="flex min-h-11.5 w-full cursor-pointer items-center gap-2 border-foreground/8 border-b py-2.5 text-left text-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/15 dark:border-white/8"
      >
        <span className="font-medium text-muted-foreground">{title}</span>
        <span className="min-w-0 truncate text-muted-foreground text-xs">
          {previous.length} · last used until {latest.usedUntil}
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div id={listId} className="pl-3">
          {previous.map((spec) => (
            <FieldDisplay key={spec.key} spec={spec} onCopy={copyField} />
          ))}
        </div>
      )}
    </div>
  );
}
