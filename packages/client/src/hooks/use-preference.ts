import { useCallback, useSyncExternalStore } from "react";
import type { PreferencesStore } from "../preferences/PreferencesStore";
import { usePreferences } from "../providers/PreferencesProvider";

const listeners = new Map<string, Set<() => void>>();

/**
 * `PreferencesStore` is a plain sync get/set with no change notification, so a
 * parsed snapshot is cached per key. `useSyncExternalStore` compares snapshots
 * by identity — without this, every read of an object-valued preference would
 * return a fresh object and loop.
 */
const snapshots = new Map<string, { raw: string | null; value: unknown }>();

function subscribe(key: string, onChange: () => void): () => void {
  let forKey = listeners.get(key);
  if (!forKey) {
    forKey = new Set();
    listeners.set(key, forKey);
  }
  forKey.add(onChange);

  return () => {
    forKey.delete(onChange);
    if (forKey.size === 0) listeners.delete(key);
  };
}

function notify(key: string): void {
  for (const onChange of listeners.get(key) ?? []) onChange();
}

/**
 * Values are written as JSON. Keys written before this hook existed hold bare
 * strings ("most-recent"), which `JSON.parse` rejects — fall back to the raw
 * value when the caller expects a string so those survive. Anything else
 * malformed (localStorage is user-editable) falls back to the default.
 */
function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return typeof fallback === "string" ? (raw as unknown as T) : fallback;
  }
}

function read<T>(store: PreferencesStore, key: string, fallback: T): T {
  const raw = store.get(key);
  const cached = snapshots.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  const value = parse(raw, fallback);
  snapshots.set(key, { raw, value });
  return value;
}

/**
 * Read and write one non-sensitive preference. Every component on the same key
 * re-renders together, so a settings control and the feature it configures stay
 * in sync without a reload.
 */
export function usePreference<T>(key: string, fallback: T): [T, (value: T) => void] {
  const store = usePreferences();

  const subscribeToKey = useCallback((onChange: () => void) => subscribe(key, onChange), [key]);
  const getSnapshot = useCallback(() => read(store, key, fallback), [store, key, fallback]);

  const value = useSyncExternalStore(subscribeToKey, getSnapshot, getSnapshot);

  const setValue = useCallback(
    (next: T) => {
      store.set(key, JSON.stringify(next));
      snapshots.delete(key);
      notify(key);
    },
    [store, key],
  );

  return [value, setValue];
}

/** Test seam — drops the parsed-snapshot cache. */
export function clearPreferenceCache(): void {
  snapshots.clear();
}
