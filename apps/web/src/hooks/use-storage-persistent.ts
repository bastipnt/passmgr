import { isWebStoragePersistent } from "@repo/store/drivers/web";
import { useEffect, useState } from "react";

/**
 * Whether vaults outlive this page: false in a Firefox private window, where
 * the browser refuses OPFS and the databases live in memory (lost on
 * lock, which reloads, and on close). `null` until known.
 */
export function useStoragePersistent(): boolean | null {
  const [persistent, setPersistent] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void isWebStoragePersistent().then((value) => {
      if (current) setPersistent(value);
    });
    return () => {
      current = false;
    };
  }, []);
  return persistent;
}
