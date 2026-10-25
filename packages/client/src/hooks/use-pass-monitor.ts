import { getStrengthFromString, loadPasswordStrength } from "@repo/crypto";
import type { DecryptedRecord } from "@repo/schema";
import type { PasswordStrength } from "@repo/util";
import { useEffect, useMemo, useState } from "react";
import { useRecordsContext } from "../providers/RecordsProvider";
import { useStore } from "../providers/StoreProvider";
import { findBreachedPasswords } from "../records/breach-check";
import {
  findDuplicateLogins,
  findInsecureWebsites,
  findMissingTwoFactor,
  findOldPasswords,
  findReusedPasswords,
  type InsecureWebsite,
  type MissingTwoFactor,
  type MonitorGroup,
  type OldPassword,
  passMonitorIssueCount,
  sortWeakPasswords,
  type WeakPassword,
  weakPasswordOf,
} from "../records/pass-monitor";
import { monitoredPassword } from "../records/password-health";
import { useStoredBreachChecks } from "./use-breach-check";
import { useTwoFactorDirectory } from "./use-two-factor-directory";

export type PassMonitor = {
  /** Every record with a monitored password; `null` until the records are decrypted. */
  monitored: DecryptedRecord[] | null;
  /** `null` until the records are decrypted and every password is rated. */
  weak: WeakPassword[] | null;
  /** The strength estimator didn't load: `weak` stays `null`. */
  weakFailed: boolean;
  reused: MonitorGroup[] | null;
  duplicates: MonitorGroup[] | null;
  old: OldPassword[] | null;
  insecure: InsecureWebsite[] | null;
  /** `null` until the records are decrypted and the 2FA directory loaded. */
  missingTwoFactor: MissingTwoFactor[] | null;
  /** The 2FA directory didn't load: `missingTwoFactor` stays `null`. */
  twoFactorFailed: boolean;
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

function ratingsOf(vault: object) {
  let ratings = ratingsByVault.get(vault);
  if (!ratings) ratingsByVault.set(vault, (ratings = new Map()));
  return ratings;
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function useCheapFindings() {
  const { records, ready, revision } = useRecordsContext();

  // `records` is a new array on every render; `revision` says when its content changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => records, [revision]);

  const cheap = useMemo(
    () =>
      ready
        ? {
            monitored: snapshot.filter((record) => monitoredPassword(record)),
            reused: findReusedPasswords(snapshot),
            duplicates: findDuplicateLogins(snapshot),
            old: findOldPasswords(snapshot),
            insecure: findInsecureWebsites(snapshot),
          }
        : null,
    [snapshot, ready],
  );

  return { snapshot, ready, cheap };
}

/**
 * Weak, reused, duplicate and old passwords, insecure websites and logins missing 2FA
 * across every vault, from the decrypted records.
 */
export function usePassMonitor(): PassMonitor {
  const { snapshot, ready, cheap } = useCheapFindings();
  const { vault } = useStore();
  const [rated, setRated] = useState<WeakPassword[] | null>(null);
  const [weakFailed, setWeakFailed] = useState(false);
  const { directory, failed: twoFactorFailed } = useTwoFactorDirectory();

  useEffect(() => {
    if (!ready || !vault) return;
    let cancelled = false;
    const ratings = ratingsOf(vault);
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

  const missingTwoFactor = useMemo(
    () => (ready && directory ? findMissingTwoFactor(snapshot, directory) : null),
    [snapshot, ready, directory],
  );

  return {
    monitored: cheap?.monitored ?? null,
    weak,
    weakFailed,
    reused: cheap?.reused ?? null,
    duplicates: cheap?.duplicates ?? null,
    old: cheap?.old ?? null,
    insecure: cheap?.insecure ?? null,
    missingTwoFactor,
    twoFactorFailed,
  };
}

/**
 * The Pass Monitor's issue count (`passMonitorIssueCount`) without its heavy part:
 * weak passwords only as far as `usePassMonitor` rated them already, breaches only
 * from stored results (nothing is checked). `null` until the records, the 2FA
 * directory and the breach setting are known.
 */
export function usePassMonitorIssueCount(): number | null {
  const { snapshot, cheap } = useCheapFindings();
  const { vault } = useStore();
  const { directory, failed: twoFactorFailed } = useTwoFactorDirectory();
  const { current: breach } = useStoredBreachChecks();

  return useMemo(() => {
    if (!cheap || !vault || !breach || (!directory && !twoFactorFailed)) return null;
    const ratings = ratingsOf(vault);
    const cachedRating = (record: DecryptedRecord) => () => ratings.get(versionKey(record)) ?? null;
    return passMonitorIssueCount({
      ...cheap,
      weak: snapshot.flatMap((record) => weakPasswordOf(record, cachedRating(record)) ?? []),
      missingTwoFactor: directory ? findMissingTwoFactor(snapshot, directory) : null,
      breached: breach.enabled ? findBreachedPasswords(cheap.monitored, breach.checks) : null,
    });
  }, [snapshot, cheap, vault, directory, twoFactorFailed, breach]);
}
