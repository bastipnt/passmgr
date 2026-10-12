import { getStrengthFromString, loadPasswordStrength } from "@repo/crypto";
import type { DecryptedRecord } from "@repo/schema";
import type { PasswordStrength } from "@repo/util";
import { useEffect, useMemo, useState } from "react";
import { useRecordsContext } from "../providers/RecordsProvider";
import { useStore } from "../providers/StoreProvider";
import {
  findDuplicateLogins,
  findOldPasswords,
  findReusedPasswords,
  type MonitorGroup,
  type OldPassword,
  sortWeakPasswords,
  type WeakPassword,
  weakPasswordOf,
} from "../records/pass-monitor";

export type PassMonitor = {
  /** `null` until the records are decrypted and every password is rated. */
  weak: WeakPassword[] | null;
  /** The strength estimator didn't load: `weak` stays `null`. */
  weakFailed: boolean;
  reused: MonitorGroup[] | null;
  duplicates: MonitorGroup[] | null;
  old: OldPassword[] | null;
};

const CHUNK_SIZE = 20;

// Ratings only, never a password: a version's rating can't change, so a revisit skips zxcvbn.
// Per open profile database, so a lock or profile switch drops them with it.
const ratingsByVault = new WeakMap<object, Map<string, PasswordStrength | null>>();
const versionKey = (record: DecryptedRecord) =>
  `${record.recordId}|${record.version}|${record.clientUpdatedAt}`;

function cachedRate(ratings: Map<string, PasswordStrength | null>, record: DecryptedRecord) {
  return (password: string, userInputs: string[]) => {
    const key = versionKey(record);
    if (!ratings.has(key)) ratings.set(key, getStrengthFromString(password, userInputs));
    return ratings.get(key) ?? null;
  };
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Weak, reused, duplicate and old passwords across every vault, from the decrypted records. */
export function usePassMonitor(): PassMonitor {
  const { records, ready, revision } = useRecordsContext();
  const { vault } = useStore();
  const [rated, setRated] = useState<WeakPassword[] | null>(null);
  const [weakFailed, setWeakFailed] = useState(false);

  // `records` is a new array on every render; `revision` says when its content changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => records, [revision]);

  const cheap = useMemo(
    () =>
      ready
        ? {
            reused: findReusedPasswords(snapshot),
            duplicates: findDuplicateLogins(snapshot),
            old: findOldPasswords(snapshot),
          }
        : null,
    [snapshot, ready],
  );

  useEffect(() => {
    if (!ready || !vault) return;
    let cancelled = false;
    let ratings = ratingsByVault.get(vault);
    if (!ratings) ratingsByVault.set(vault, (ratings = new Map()));
    void (async () => {
      await loadPasswordStrength();
      setWeakFailed(false);
      const found: WeakPassword[] = [];
      for (let start = 0; start < snapshot.length; start += CHUNK_SIZE) {
        if (start > 0) await nextTask();
        if (cancelled) return;
        for (const record of snapshot.slice(start, start + CHUNK_SIZE)) {
          const finding = weakPasswordOf(record, cachedRate(ratings, record));
          if (finding) found.push(finding);
        }
      }
      const current = new Set(snapshot.map(versionKey));
      for (const key of ratings.keys()) if (!current.has(key)) ratings.delete(key);
      if (!cancelled) setRated(sortWeakPasswords(found));
    })().catch((error: unknown) => {
      console.error("Failed to load the password strength estimator", error);
      if (!cancelled) setWeakFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [snapshot, ready, vault]);

  // The last rating shows while the next one runs, so a sync doesn't blank the list; only
  // for records still present (record ids are UUIDs, so another profile's never match).
  const weak = useMemo(() => {
    if (!ready || !rated) return null;
    const ids = new Set(snapshot.map((record) => record.recordId));
    return rated.filter((finding) => ids.has(finding.record.recordId));
  }, [snapshot, ready, rated]);

  return {
    weak,
    weakFailed,
    reused: cheap?.reused ?? null,
    duplicates: cheap?.duplicates ?? null,
    old: cheap?.old ?? null,
  };
}
