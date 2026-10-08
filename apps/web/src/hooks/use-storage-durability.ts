import { useCallback, useEffect, useState } from "react";

/**
 * Ask the browser to keep this origin's storage (OPFS) under storage pressure
 * (ADR 0001 D12). Without it, a local-only vault can be evicted. Browsers
 * decide on their own (Chrome by engagement, Firefox asks, Safari grants
 * installed web apps); call it from a user gesture. Resolves `null` where the
 * API is missing.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    return await navigator.storage.persist();
  } catch (e) {
    console.error("Requesting persistent storage failed", e);
    return null;
  }
}

export type StorageDurability = {
  /** False until the browser answered (or turned out not to support the API). */
  loaded: boolean;
  /** Whether the browser promised to keep the data; `null` when it doesn't say. */
  persisted: boolean | null;
  /** Bytes used by this origin and the browser's quota for it; `null` when unknown. */
  usage: number | null;
  quota: number | null;
};

const LOADING: StorageDurability = { loaded: false, persisted: null, usage: null, quota: null };
const UNKNOWN: StorageDurability = { ...LOADING, loaded: true };

async function readDurability(): Promise<StorageDurability> {
  const storage = navigator.storage;
  if (!storage) return UNKNOWN;
  const [persisted, estimate] = await Promise.all([
    storage.persisted ? storage.persisted().catch(() => null) : null,
    storage.estimate ? storage.estimate().catch(() => null) : null,
  ]);
  return {
    loaded: true,
    persisted,
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
  };
}

/**
 * Whether this origin's storage is persistent, how much of the quota it uses
 * (`navigator.storage.estimate()`), and `request` to ask for persistence again.
 */
export function useStorageDurability() {
  const [durability, setDurability] = useState<StorageDurability>(LOADING);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let current = true;
    void readDurability().then((value) => {
      if (current) setDurability(value);
    });
    return () => {
      current = false;
    };
  }, []);

  const request = useCallback(async () => {
    setRequesting(true);
    try {
      await requestPersistentStorage();
      setDurability(await readDurability());
    } finally {
      setRequesting(false);
    }
  }, []);

  return { ...durability, request, requesting };
}
