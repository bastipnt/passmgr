import { BrandMark } from "@repo/ui/components/BrandMark";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/Empty";
import Link from "@repo/ui/components/Link";
import { LockIcon, PlusIcon, RefreshCwIcon, WifiOffIcon } from "lucide-react";
import { createSheetSearch } from "./CreateRecordSheet";

const FEATURES = [
  { icon: LockIcon, label: "End-to-end encrypted" },
  { icon: RefreshCwIcon, label: "Syncs to web & mobile" },
  { icon: WifiOffIcon, label: "Works offline" },
];

/** Stacked cards: two tilted blanks behind the brand tile. */
function VaultIllustration() {
  return (
    <div className="relative h-32 w-52" aria-hidden>
      <div className="absolute inset-x-2 top-6 h-24 -rotate-6 rounded-2xl border border-foreground/10 bg-foreground/[0.04] dark:border-white/10 dark:bg-white/[0.05]" />
      <div className="absolute inset-x-2 top-6 h-24 rotate-6 rounded-2xl border border-foreground/10 bg-foreground/[0.04] dark:border-white/10 dark:bg-white/[0.05]" />
      <div className="absolute inset-x-7 top-0 grid h-24 place-items-center rounded-2xl bg-primary shadow-primary/30 shadow-xl">
        <BrandMark className="size-12 bg-transparent" />
      </div>
    </div>
  );
}

export default function RecordsEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <Empty className="gap-6">
        <EmptyHeader className="max-w-md gap-3">
          <EmptyMedia>
            <VaultIllustration />
          </EmptyMedia>
          <EmptyTitle className="text-3xl">Your vault is empty</EmptyTitle>
          <EmptyDescription className="text-base">
            Add your first login to get started. It&apos;s encrypted on this device before it ever
            reaches the server.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-md gap-6">
          <Link variant="default" size="lg" href={createSheetSearch()}>
            <PlusIcon />
            Create record
          </Link>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-muted-foreground text-sm">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="size-4 text-primary dark:text-ring" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </EmptyContent>
      </Empty>
    </div>
  );
}
