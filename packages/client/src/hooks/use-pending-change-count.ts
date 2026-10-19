import { useEffect, useState } from "react";
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
