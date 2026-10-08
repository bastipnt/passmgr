import { useStore } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { FieldError } from "@repo/ui/components/Field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Spinner } from "@repo/ui/components/Spinner";
import { HardDriveIcon } from "lucide-react";
import { useStorageDurability } from "@/hooks/use-storage-durability";

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** Decimal units, like the browsers' own storage settings: "1.2MB". */
function formatBytes(value: number): string {
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat("en", {
    style: "unit",
    unit: UNITS[unit],
    unitDisplay: "narrow",
    maximumFractionDigits: 1,
  }).format(value);
}

/** "1.2MB of 10GB", or null when the browser doesn't say. */
export function formatStorageUsage(usage: number | null, quota: number | null): string | null {
  if (usage === null) return null;
  return quota === null ? formatBytes(usage) : `${formatBytes(usage)} of ${formatBytes(quota)}`;
}

/**
 * This browser's storage for the vault (ADR 0001 D12): whether it is
 * persistent (`navigator.storage.persist()`), how much of the quota it uses,
 * and a warning when a local-only vault may be evicted.
 */
export default function StorageSettings() {
  const { profile } = useStore();
  const { loaded, persisted, usage, quota, request, requesting } = useStorageDurability();
  const usageLabel = formatStorageUsage(usage, quota);
  const localOnly = profile?.mode === "local";

  return (
    <Item variant="outline">
      <ItemContent className="gap-1">
        <ItemTitle>
          <HardDriveIcon className="size-4" aria-hidden />
          Storage on this device
        </ItemTitle>
        <ItemDescription>
          {!loaded
            ? "Checking…"
            : persisted === true
              ? "Persistent: the browser keeps your vault even when space runs low."
              : persisted === false
                ? "Not persistent: the browser may delete your vault when space runs low."
                : "This browser doesn't say whether it keeps your vault."}
          {usageLabel && ` Using ${usageLabel}.`}
        </ItemDescription>
        {persisted === false && localOnly && (
          <FieldError variant="box" className="mt-2">
            This vault exists only in this browser. If the browser clears its storage, it is gone
            for good. Create an online account to keep a copy.
          </FieldError>
        )}
      </ItemContent>
      {persisted === false && (
        <ItemActions>
          <Button variant="outline" disabled={requesting} onClick={() => void request()}>
            {requesting && <Spinner />}
            Keep data
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}
