import { useEffect, useState } from "react";
import { useStore } from "../providers/StoreProvider";

/**
 * How many local changes haven't reached the server yet (undefined until
 * counted). Re-counted after every sync.
 */
export function usePendingChangeCount(): number | undefined {
  const { vault, syncManager } = useStore();
  const [count, setCount] = useState<number>();

  useEffect(() => {
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
