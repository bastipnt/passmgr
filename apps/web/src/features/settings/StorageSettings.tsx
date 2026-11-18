import { useStore } from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import { Spinner } from "@repo/ui/components/Spinner";
import { StatusPill } from "@repo/ui/components/StatusPill";
import { formatBytes } from "@repo/util";
import { useStorageDurability } from "@/hooks/use-storage-durability";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsRow } from "./SettingsRow";

/** Decorative: the row above says how much is used. */
function UsageBar({ usage, quota }: { usage: number; quota: number }) {
  const percent = Math.min(100, (usage / quota) * 100);
  return (
    <div
      aria-hidden="true"
      className="mx-5 mb-4 h-1.5 overflow-hidden rounded-full bg-muted max-sm:mx-4.5"
    >
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${Math.max(percent, 1)}%` }}
      />
    </div>
  );
}

/**
 * This browser's storage for the vault (ADR 0001 D12): how much of the quota
 * it uses, whether it is persistent (`navigator.storage.persist()`), and a
 * warning when a local-only vault may be evicted.
 */
export default function StorageSettings() {
  const { profile, active } = useStore();
  const { loaded, persisted, usage, quota, request, requesting } = useStorageDurability();
  const linked = profile?.mode === "linked";
  // A demo vault has its own notice: no account to suggest.
  const demo = active?.entry.demo === true;

  return (
    <SettingsGroup label="Storage on this device">
      <div>
        <SettingsRow
          label={
            !loaded ? "Checking…" : usage === null ? "Usage unknown" : `${formatBytes(usage)} used`
          }
          hint={
            quota === null ? undefined : `of ${formatBytes(quota)} the browser allows for this site`
          }
          control={
            persisted === true ? (
              <StatusPill tone="success">Persistent</StatusPill>
            ) : persisted === false ? (
              <StatusPill tone="warning">Not persistent</StatusPill>
            ) : undefined
          }
        />
        {usage !== null && quota !== null && quota > 0 && <UsageBar usage={usage} quota={quota} />}
      </div>
      {persisted === false && (
        <SettingsRow
          label="Keep data on this device"
          hint={
            linked
              ? "Without this the browser may delete your vault when space runs low. Items already synced can be downloaded again."
              : demo
                ? "Without this the browser may delete this demo vault when space runs low."
                : "This vault exists only in this browser: if the browser clears its storage when space runs low, it is gone for good. Create an online account to keep a copy."
          }
          stackOnPhone
          control={
            <Button disabled={requesting} onClick={() => void request()}>
              {requesting && <Spinner />}
              Keep data
            </Button>
          }
        />
      )}
      {loaded && persisted === null && (
        <SettingsRow
          label="Keeping data"
          hint="This browser doesn't say whether it keeps your vault when space runs low."
        />
      )}
    </SettingsGroup>
  );
}
