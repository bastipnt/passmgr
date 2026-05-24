import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DecryptedRecord } from "@repo/schema";
import { SessionContext } from "./SessionProvider";
import { useStore } from "./StoreProvider";
import { decryptRecordWithWorker } from "../util/decrypt-record";
import { timed } from "../util/perf";
import type { EncryptedRecordSchema } from "@repo/schema";

type RecordsContextValue = {
  records: DecryptedRecord[];
  getRecord: (id: string) => DecryptedRecord | undefined;
  ready: boolean;
  refreshRecord: (id: string) => Promise<void>;
};

const RecordsContext = createContext<RecordsContextValue | null>(null);

export function useRecordsContext() {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error("useRecordsContext must be used within RecordsProvider");
  return ctx;
}

function buildFingerprint(record: EncryptedRecordSchema): string {
  return `${record.encryptedData}|${record.encryptionNonce}`;
}

async function decryptRecord(encrypted: EncryptedRecordSchema): Promise<DecryptedRecord> {
  const decrypted = await decryptRecordWithWorker(
    encrypted.encryptedData,
    encrypted.encryptionNonce,
  );
  return {
    ...decrypted,
    recordId: encrypted.recordId,
    version: encrypted.version,
    clientUpdatedAt: encrypted.clientUpdatedAt,
    created_at: encrypted.created_at ?? null,
  };
}

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

  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);

  const runDecryptAll = useCallback(async () => {
    const encrypted = await vault.getAllLatest();
    const activeIds = new Set<string>();

    // Find records that are new or changed
    const toDecrypt: EncryptedRecordSchema[] = [];
    for (const record of encrypted) {
      if (record.deleted_at) continue;

      activeIds.add(record.recordId);
      const fp = buildFingerprint(record);

      if (fingerprintMapRef.current.get(record.recordId) !== fp) {
        toDecrypt.push(record);
        fingerprintMapRef.current.set(record.recordId, fp);
      }
    }

    // Decrypt changed/new records
    if (toDecrypt.length > 0) {
      const decrypted = await timed(`decrypt ${toDecrypt.length} records`, () =>
        Promise.all(toDecrypt.map(decryptRecord)),
      );

      for (const record of decrypted) {
        recordsMapRef.current.set(record.recordId, record);
      }
    }

    // Remove deleted records
    for (const id of recordsMapRef.current.keys()) {
      if (!activeIds.has(id)) {
        recordsMapRef.current.delete(id);
        fingerprintMapRef.current.delete(id);
      }
    }

    setRevision((r) => r + 1);
    setReady(true);
  }, [vault]);

  // Serialize runs: the initial-unlock and on-sync effects can both fire before
  // either writes fingerprints, which would race into decrypting everything
  // twice. Chaining lets the second run see the first run's fingerprints and
  // no-op, so the fingerprint dedup actually applies. Run regardless of whether
  // the previous run resolved or rejected, so one failure doesn't stall the chain.
  const decryptAll = useCallback(() => {
    const prev = runningRef.current ?? Promise.resolve();
    const run = prev.then(runDecryptAll, runDecryptAll);
    runningRef.current = run;
    void run.finally(() => {
      if (runningRef.current === run) runningRef.current = null;
    });
    return run;
  }, [runDecryptAll]);

  // Initial decryption when vault becomes ready
  useEffect(() => {
    if (!vaultUnlocked) return;

    void decryptAll();
  }, [vaultUnlocked, decryptAll]);

  // Re-decrypt on sync
  useEffect(() => {
    if (!vaultUnlocked) return;
    return syncManager.onSync(() => void decryptAll());
  }, [vaultUnlocked, syncManager, decryptAll]);

  const refreshRecord = useCallback(
    async (id: string) => {
      const encrypted = await vault.getByRecordId(id);

      if (!encrypted || encrypted.deleted_at) {
        recordsMapRef.current.delete(id);
        fingerprintMapRef.current.delete(id);
      } else {
        const decrypted = await decryptRecord(encrypted);
        recordsMapRef.current.set(id, decrypted);
        fingerprintMapRef.current.set(id, buildFingerprint(encrypted));
      }

      setRevision((r) => r + 1);
    },
    [vault],
  );

  const getRecord = useCallback(
    (id: string) => recordsMapRef.current.get(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  );

  const value: RecordsContextValue = {
    records: Array.from(recordsMapRef.current.values()),
    getRecord,
    ready,
    refreshRecord,
  };

  return <RecordsContext value={value}>{children}</RecordsContext>;
}
