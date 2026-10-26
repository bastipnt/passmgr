import { RECORD_TYPE_LABELS, useRecordVault, useSortedRecords } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { LockIcon } from "lucide-react";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { VaultTile } from "@/features/vaults";

/** "▣ Vault · Type | #tag #tag" under the title; a tag shows every record carrying it. */
export function RecordSubtitle({ record }: { record: DecryptedRecord }) {
  const { vault: recordVault, writable, showVault } = useRecordVault(record);
  const vault = showVault ? recordVault : undefined;
  const { showTag: filterByTag } = useSortedRecords();
  const [, navigate] = useLocation();
  const tags = record.tags ?? [];

  function showTag(tag: string) {
    filterByTag(tag);
    navigate(recordPaths.index);
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.75 gap-y-1 text-muted-foreground text-sm">
      {vault && <VaultTile vault={vault} size="xs" />}
      <span>
        {vault && `${vault.name} · `}
        {RECORD_TYPE_LABELS[record.type].type}
      </span>
      {!writable && (
        <span className="inline-flex items-center gap-1">
          <LockIcon className="size-3.5" aria-hidden />
          Read only
        </span>
      )}
      {tags.length > 0 && (
        <span aria-hidden className="text-foreground/20">
          |
        </span>
      )}
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          aria-label={`Show items tagged ${tag}`}
          className="rounded-sm text-[0.8125rem] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => showTag(tag)}
        >
          <span className="font-semibold text-muted-foreground/70">#</span>
          {tag}
        </button>
      ))}
    </p>
  );
}
