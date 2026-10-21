import type { ProfileEntry } from "@repo/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../providers/StoreProvider";

/**
 * How many local changes of the active profile haven't reached the server yet
 * (undefined until counted, or without a profile). Re-counted after every sync.
 */
export function usePendingChangeCount(): number | undefined {
  const { vault, syncManager } = useStore();
  const [count, setCount] = useState<number>();

  useEffect(() => {
    setCount(undefined);
    if (!vault || !syncManager) return;
    let live = true;
    const refresh = () =>
      void vault.countPendingChanges().then((n) => {
        if (live) setCount(n);
      });
    refresh();
    const unsubscribe = syncManager.onSync(refresh);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [vault, syncManager]);

  return count;
}

/** The warning to add when removing a linked vault would lose changes, if any would. */
export function unsyncedChangesWarning(count: number | undefined): string {
  if (!count) return "";
  return count === 1
    ? " 1 change on this device hasn't synced yet and will be lost."
    : ` ${count} changes on this device haven't synced yet and will be lost.`;
}

/** What removing one vault from this device loses: a local vault is its only copy. */
export function removeVaultDescription(
  linked: boolean,
  pendingChanges: number | undefined,
): string {
  return linked
    ? `This deletes the vault from this device. Your account and the data on the server are not affected; sign in again to get it back.${unsyncedChangesWarning(pendingChanges)}`
    : "This deletes the only copy of your vault. Without an export, everything in it is lost for good.";
}

/**
 * What removing these profiles from this device loses for good: a vault
 * without an account (the only copy) and changes that never synced.
 */
export function removeVaultsDescription(
  profiles: readonly Pick<ProfileEntry, "mode">[],
  pendingChanges: number | undefined,
): string {
  const local = profiles.filter((p) => p.mode === "local").length;
  const vaults = profiles.length === 1 ? "the vault" : `all ${profiles.length} vaults`;
  const lost =
    local === 0
      ? ""
      : local === 1
        ? " One vault has no account: this is its only copy, everything in it is lost for good."
        : ` ${local} vaults have no account: these are their only copies, everything in them is lost for good.`;
  return `This deletes ${vaults} from this device. Accounts and their data on the server are not affected.${lost}${unsyncedChangesWarning(pendingChanges)}`;
}

/**
 * Unsynced changes of the given profiles (open or not), counted on demand
 * when a remove dialog opens: undefined until counted.
 */
export function useProfilesPendingChanges() {
  const { countPendingChanges } = useStore();
  const [pending, setPending] = useState<number>();
  const latest = useRef(0);

  const count = useCallback(
    async (profiles: readonly ProfileEntry[]) => {
      const run = ++latest.current;
      setPending(undefined);
      try {
        const counts = await Promise.all(
          profiles.filter((p) => p.mode === "linked").map((p) => countPendingChanges(p.profileId)),
        );
        if (run === latest.current) setPending(counts.reduce((sum, n) => sum + n, 0));
      } catch (e) {
        console.error("Counting unsynced changes failed", e);
      }
    },
    [countPendingChanges],
  );

  return { pending, count };
}
