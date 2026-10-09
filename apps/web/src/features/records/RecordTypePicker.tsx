import { RECORD_TYPE_LABELS } from "@repo/client";
import { RECORD_TYPES, type RecordType } from "@repo/schema";
import { ChevronRightIcon } from "lucide-react";
import { Link } from "wouter";
import { RecordTypeTile } from "./RecordAvatar";

type RecordTypePickerProps = {
  /** Href that opens the form of `type`. */
  hrefFor: (type: RecordType) => string;
};

/** The first step of "New item": one row per record type. */
export function RecordTypePicker({ hrefFor }: RecordTypePickerProps) {
  return (
    <nav aria-label="Item type" className="px-3 py-4 sm:px-5 sm:py-5">
      <ul className="grid gap-1 sm:grid-cols-2">
        {RECORD_TYPES.map((type) => (
          <li key={type}>
            <Link
              href={hrefFor(type)}
              replace
              aria-label={RECORD_TYPE_LABELS[type].type}
              aria-describedby={`record-type-hint-${type}`}
              className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/5"
            >
              <RecordTypeTile type={type} size="md" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{RECORD_TYPE_LABELS[type].type}</span>
                <span
                  id={`record-type-hint-${type}`}
                  className="truncate text-muted-foreground text-sm"
                >
                  {RECORD_TYPE_LABELS[type].hint}
                </span>
              </span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
