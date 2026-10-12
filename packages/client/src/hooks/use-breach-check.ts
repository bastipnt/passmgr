import type { DecryptedRecord } from "@repo/schema";
import { type BreachCheck, breachCheckKey, type Vault } from "@repo/store";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRecordsContext } from "../providers/RecordsProvider";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import {
  type BreachedPassword,
  breachVersion,
  countBreaches,
  findBreachedPasswords,
  isBreachCheckStale,
} from "../records/breach-check";
import { monitoredPassword } from "../records/password-health";

export type BreachCheckState = {
  /** `null` while the setting loads. */
  enabled: boolean | null;
  setEnabled: (enabled: boolean) => Promise<void>;
  /** `null` while nothing is known yet: off, loading, or no password checked so far. */
  breached: BreachedPassword[] | null;
  checking: boolean;
  /** The last run left passwords unchecked (network or HIBP failure). */
  failed: boolean;
  /** The device has no network: only stored results show. */
  offline: boolean;
  /** When the least recently checked current password was checked. */
  lastCheckedAt: string | null;
};

// Setting and results of one profile database: a profile switch never runs on the previous one's opt-in.
type Loaded = { vault: Vault; enabled: boolean; checks: Map<string, BreachCheck> };

const SAVE_EVERY = 25;

const byVersion = (checks: readonly BreachCheck[]) =>
  new Map(checks.map((check) => [breachCheckKey(check), check]));

/**
 * Breach check (HIBP k-anonymity) of every login and Wi-Fi password, opt-in per
 * profile on this device. While mounted and on, checks the passwords without a
 * result or with one older than `BREACH_RECHECK_DAYS`.
 */
export function useBreachCheck(): BreachCheckState {
  const { records, ready, revision } = useRecordsContext();
  const { vault } = useStore();
  const { networkOffline } = useContext(SessionContext);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  const current = loaded && loaded.vault === vault ? loaded : null;
  const enabled = current?.enabled ?? null;
  const checks = current?.checks;

  // `records` is a new array on every render; `revision` says when its content changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => records, [revision]);
  const monitored = useMemo(
    () => (ready ? snapshot.filter((record) => monitoredPassword(record)) : []),
    [snapshot, ready],
  );

  useEffect(() => {
    if (!vault) return;
    let cancelled = false;
    void (async () => {
      const [on, stored] = await Promise.all([
        vault.isBreachCheckEnabled(),
        vault.getBreachChecks(),
      ]);
      if (!cancelled) setLoaded({ vault, enabled: on, checks: byVersion(stored) });
    })().catch((error: unknown) => console.error("Failed to read the breach check", error));
    return () => {
      cancelled = true;
    };
  }, [vault]);

  useEffect(() => {
    if (!vault || !ready || !enabled || !checks || networkOffline) return;
    const controller = new AbortController();
    const versions = monitored.map(breachVersion);
    const due = monitored.filter((record) => {
      const check = checks.get(breachCheckKey(record));
      return !check || isBreachCheckStale(check);
    });
    setFailed(false);

    let pending: BreachCheck[] = [];
    let saving = Promise.resolve();
    // Serialized, so results land in order. Only a finished run prunes and publishes;
    // an aborted one's `versions` may be outdated and its state belongs to no one.
    const flush = (finished = false) => {
      const batch = pending;
      pending = [];
      saving = saving.then(async () => {
        await vault.saveBreachChecks(batch, finished ? versions : undefined);
        if (controller.signal.aborted) return;
        const stored = byVersion(await vault.getBreachChecks());
        if (!controller.signal.aborted) setLoaded({ vault, enabled: true, checks: stored });
      });
      return saving;
    };
    const logSaveError = (error: unknown) => console.error("Failed to save breach checks", error);

    if (due.length === 0) {
      void flush(true).catch(logSaveError);
      return () => controller.abort();
    }

    setChecking(true);
    const recordsByKey = new Map(due.map((record) => [breachCheckKey(record), record]));
    const checkedAt = new Date().toISOString();
    void countBreaches(due, {
      signal: controller.signal,
      onResult: (found) => {
        for (const [key, count] of found) {
          const record = recordsByKey.get(key)!;
          pending.push({ ...breachVersion(record), vaultId: record.vaultId, count, checkedAt });
        }
        if (pending.length >= SAVE_EVERY) void flush().catch(logSaveError);
      },
    })
      .then(async (counts) => {
        await flush(true);
        if (controller.signal.aborted) return;
        setFailed(counts.size < due.length);
        setChecking(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          // Keep what an aborted run found so far.
          void flush().catch(logSaveError);
          return;
        }
        console.error("Breach check failed", error);
        setFailed(true);
        setChecking(false);
      });
    return () => {
      controller.abort();
      setChecking(false);
    };
    // `checks` changes as results come in; re-running for it would restart the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault, ready, enabled, !!checks, networkOffline, monitored]);

  const setEnabled = useCallback(
    async (on: boolean) => {
      if (!vault) return;
      await vault.setBreachCheckEnabled(on);
      setFailed(false);
      setLoaded((prev) => ({
        vault,
        enabled: on,
        checks: on && prev?.vault === vault ? prev.checks : new Map(),
      }));
    },
    [vault],
  );

  const { breached, lastCheckedAt } = useMemo(() => {
    if (!enabled || !ready || !checks) return { breached: null, lastCheckedAt: null };
    const covered = monitored.flatMap((record) => checks.get(breachCheckKey(record)) ?? []);
    if (monitored.length > 0 && covered.length === 0) {
      return { breached: null, lastCheckedAt: null };
    }
    return {
      breached: findBreachedPasswords(monitored, checks),
      lastCheckedAt: covered.reduce<string | null>(
        (oldest, { checkedAt }) => (oldest === null || checkedAt < oldest ? checkedAt : oldest),
        null,
      ),
    };
  }, [enabled, ready, monitored, checks]);

  return {
    enabled,
    setEnabled,
    breached,
    checking,
    failed,
    offline: networkOffline,
    lastCheckedAt,
  };
}

/** The stored breach count of a record's current password; `null` when off or not checked. */
export function useStoredBreachCount(record: DecryptedRecord): number | null {
  const { vault } = useStore();
  const [found, setFound] = useState<{ key: string; count: number | null } | null>(null);
  const key = breachCheckKey(record);

  useEffect(() => {
    if (!vault) return;
    let cancelled = false;
    void vault
      .getBreachCheck(breachVersion(record))
      .then((check) => {
        if (!cancelled) setFound({ key, count: check?.count ?? null });
      })
      .catch((error: unknown) => console.error("Failed to read the breach check", error));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault, key]);

  return found?.key === key ? found.count : null;
}
