import type { DecryptedRecord, EncryptedRecordSchema } from "@repo/schema";
import type { LocalRecordVersion } from "@repo/store";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { logError } from "../errors/log-error";
import { forgetPasswordRatings } from "../records/password-ratings";
import { decryptRecordRow } from "../util/decrypt-record";
import { timed } from "../util/perf";
import { decryptVaults, sameVaultInfos, type VaultInfo } from "../vaults/vault-info";
import { SessionContext } from "./SessionProvider";
import { useStore } from "./StoreProvider";

type RecordsContextValue = {
  records: DecryptedRecord[];
  getRecord: (id: string) => DecryptedRecord | undefined;
  ready: boolean;
  refreshRecord: (id: string) => Promise<void>;
  /** Re-read every local record, e.g. after an import wrote many at once. */
  reload: () => Promise<void>;
  /** Bumps whenever the local records were re-read (a local write or a sync). */
  revision: number;
  /** The vaults whose keys are loaded, decrypted (`decryptVaults`): re-read with the records. */
  vaults: VaultInfo[];
};

const RecordsContext = createContext<RecordsContextValue | null>(null);

export function useRecordsContext() {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error("useRecordsContext must be used within RecordsProvider");
  return ctx;
}

// The version too: a sync can renumber a pending local version without touching its ciphertext.
// The nonce stands in for the ciphertext: every encryption draws a fresh one, and keeping
// the whole ciphertext here would hold a second copy of every record in memory.
function buildFingerprint(record: EncryptedRecordSchema): string {
  return `${record.vaultId}|${record.version}|${record.encryptionNonce}`;
}

const NO_RECORDS: DecryptedRecord[] = [];

type DecryptedRecordsProviderProps = {
  children: ReactNode;
};

export function RecordsProvider({ children }: DecryptedRecordsProviderProps) {
  // TODO: why vault ready in SessionsContext, refactor SessionsContext to also have hook form
  const { vaultUnlocked } = useContext(SessionContext);
  const { vault, syncManager } = useStore();

  const recordsMapRef = useRef(new Map<string, DecryptedRecord>());
  const fingerprintMapRef = useRef(new Map<string, string>());
  const runningRef = useRef<Promise<void> | null>(null);
  // Bumped when the decrypted records are dropped: a run queued before must not write them back.
  const generationRef = useRef(0);
  const unlockedRef = useRef(vaultUnlocked);

  const [revision, setRevision] = useState(0);
  // The list keeps its identity until a record changes: a sync that brought nothing new must
  // not rerun every filter, sort and search downstream.
  const [records, setRecords] = useState<DecryptedRecord[]>(NO_RECORDS);
  const [ready, setReady] = useState(false);
  const [vaults, setVaults] = useState<VaultInfo[]>([]);

  const runDecryptAll = useCallback(
    async (generation: number) => {
      if (!vault || !unlockedRef.current || generation !== generationRef.current) return;
      // The vault list with the records: a sync that changed one may change the other.
      const [vaultRows, encrypted] = await Promise.all([vault.getVaults(), vault.getAllLatest()]);
      if (generation !== generationRef.current) return;
      // The same list keeps its identity: every `useVaults` consumer would re-render on each sync.
      const nextVaults = decryptVaults(vaultRows);
      setVaults((current) => (sameVaultInfos(current, nextVaults) ? current : nextVaults));
      const activeIds = new Set<string>();

      const toDecrypt: LocalRecordVersion[] = [];
      for (const record of encrypted) {
        if (record.deleted_at) continue;

        activeIds.add(record.recordId);
        const fp = buildFingerprint(record);

        if (fingerprintMapRef.current.get(record.recordId) !== fp) toDecrypt.push(record);
      }

      // Decrypt changed/new records. One that fails (wrong key, tampered) is left
      // out and retried on the next run, instead of hiding every other record.
      let changed = false;
      if (toDecrypt.length > 0) {
        const results = await timed(`decrypt ${toDecrypt.length} records`, () =>
          Promise.allSettled(toDecrypt.map((row) => decryptRecordRow(row))),
        );
        if (generation !== generationRef.current) return;

        let failed = 0;
        results.forEach((result, i) => {
          const encryptedRecord = toDecrypt[i]!;
          if (result.status === "rejected") {
            failed++;
            return;
          }
          recordsMapRef.current.set(result.value.recordId, result.value);
          fingerprintMapRef.current.set(
            encryptedRecord.recordId,
            buildFingerprint(encryptedRecord),
          );
          changed = true;
        });
        if (failed > 0) logError(`${failed} record(s) could not be decrypted and are hidden`);
      }

      for (const id of recordsMapRef.current.keys()) {
        if (!activeIds.has(id)) {
          recordsMapRef.current.delete(id);
          fingerprintMapRef.current.delete(id);
          changed = true;
        }
      }

      if (changed) setRecords(Array.from(recordsMapRef.current.values()));
      setRevision((r) => r + 1);
      setReady(true);
    },
    [vault],
  );

  // Serialize runs: the initial-unlock and on-sync effects can both fire before
  // either writes fingerprints, which would race into decrypting everything
  // twice. Chaining lets the second run see the first run's fingerprints and
  // no-op, so the fingerprint dedup actually applies. Run regardless of whether
  // the previous run resolved or rejected, so one failure doesn't stall the chain.
  const decryptAll = useCallback(() => {
    const generation = generationRef.current;
    const runOnce = () => runDecryptAll(generation);
    const prev = runningRef.current ?? Promise.resolve();
    const run = prev.then(runOnce, runOnce);
    runningRef.current = run;
    void run.finally(() => {
      if (runningRef.current === run) runningRef.current = null;
    });
    return run;
  }, [runDecryptAll]);

  // A lock or another profile: nothing decrypted before may stay in memory or show.
  useEffect(() => {
    generationRef.current++;
    unlockedRef.current = vaultUnlocked;
    recordsMapRef.current = new Map();
    fingerprintMapRef.current = new Map();
    setRecords(NO_RECORDS);
    setVaults([]);
    setReady(false);
    setRevision((r) => r + 1);
    if (vaultUnlocked) void decryptAll();
    return () => {
      if (vault) forgetPasswordRatings(vault);
    };
  }, [vaultUnlocked, vault, decryptAll]);

  useEffect(() => {
    if (!vaultUnlocked || !syncManager) return;
    return syncManager.onSync(() => void decryptAll());
  }, [vaultUnlocked, syncManager, decryptAll]);

  // Flows that switch profiles (create, restore, demo) call it after awaiting: it must reach the vault open now.
  const latestDecryptAll = useRef(decryptAll);
  useEffect(() => {
    latestDecryptAll.current = decryptAll;
  }, [decryptAll]);
  const reload = useCallback(() => latestDecryptAll.current(), []);

  const refreshRecord = useCallback(
    async (id: string) => {
      if (!vault || !unlockedRef.current) return;
      const generation = generationRef.current;
      const encrypted = await vault.getByRecordId(id);
      if (generation !== generationRef.current) return;
      const decrypted =
        encrypted && !encrypted.deleted_at ? await decryptRecordRow(encrypted) : undefined;
      if (generation !== generationRef.current) return;

      if (encrypted && decrypted) {
        recordsMapRef.current.set(id, decrypted);
        fingerprintMapRef.current.set(id, buildFingerprint(encrypted));
      } else {
        recordsMapRef.current.delete(id);
        fingerprintMapRef.current.delete(id);
      }

      setRecords(Array.from(recordsMapRef.current.values()));
      setRevision((r) => r + 1);
    },
    [vault],
  );

  // Gated in render too: the render where the lock lands comes before the effect that clears the maps.
  const getRecord = useCallback(
    (id: string) => (vaultUnlocked ? recordsMapRef.current.get(id) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision, vaultUnlocked],
  );

  const value = useMemo<RecordsContextValue>(
    () => ({
      records: vaultUnlocked ? records : NO_RECORDS,
      getRecord,
      ready: ready && vaultUnlocked,
      refreshRecord,
      reload,
      revision,
      vaults,
    }),
    [vaultUnlocked, records, getRecord, ready, refreshRecord, reload, revision, vaults],
  );

  return <RecordsContext value={value}>{children}</RecordsContext>;
}
