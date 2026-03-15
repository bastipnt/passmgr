import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DecryptedItem } from "@repo/schema";
import { SessionContext } from "./SessionProvider";
import { useStore } from "./StoreProvider";
import { decryptItemWithWorker } from "../util/decrypt-item";
import type { EncryptedItemSchema } from "@repo/schema";

type ItemsContextValue = {
  items: DecryptedItem[];
  getItem: (id: string) => DecryptedItem | undefined;
  ready: boolean;
  refreshItem: (id: string) => Promise<void>;
};

const ItemsContext = createContext<ItemsContextValue | null>(null);

export function useItemsContext() {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error("useItemsContext must be used within ItemsProvider");
  return ctx;
}

function buildFingerprint(item: EncryptedItemSchema): string {
  return `${item.encryptedData}|${item.encryptionNonce}`;
}

async function decryptItem(encrypted: EncryptedItemSchema): Promise<DecryptedItem> {
  const decrypted = await decryptItemWithWorker(encrypted.encryptedData, encrypted.encryptionNonce);
  return {
    ...decrypted,
    itemId: encrypted.itemId,
    version: encrypted.version,
    clientUpdatedAt: encrypted.clientUpdatedAt,
    created_at: encrypted.created_at ?? null,
  };
}

type DecryptedItemsProviderProps = {
  children: ReactNode;
};

export function ItemsProvider({ children }: DecryptedItemsProviderProps) {
  // TODO: why vault ready in SessionsContext, refactor SessionsContext to also have hook form
  const { vaultUnlocked } = useContext(SessionContext);
  const { vault, syncManager } = useStore();

  const itemsMapRef = useRef(new Map<string, DecryptedItem>());
  const fingerprintMapRef = useRef(new Map<string, string>());

  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);

  const decryptAll = useCallback(async () => {
    const encrypted = await vault.getAllLatest();
    const activeIds = new Set<string>();

    // Find items that are new or changed
    const toDecrypt: EncryptedItemSchema[] = [];
    for (const item of encrypted) {
      if (item.deleted_at) continue;

      activeIds.add(item.itemId);
      const fp = buildFingerprint(item);

      if (fingerprintMapRef.current.get(item.itemId) !== fp) {
        toDecrypt.push(item);
        fingerprintMapRef.current.set(item.itemId, fp);
      }
    }

    // Decrypt changed/new items
    if (toDecrypt.length > 0) {
      const decrypted = await Promise.all(toDecrypt.map(decryptItem));

      for (const item of decrypted) {
        itemsMapRef.current.set(item.itemId, item);
      }
    }

    // Remove deleted items
    for (const id of itemsMapRef.current.keys()) {
      if (!activeIds.has(id)) {
        itemsMapRef.current.delete(id);
        fingerprintMapRef.current.delete(id);
      }
    }

    setRevision((r) => r + 1);
    setReady(true);
  }, [vault]);

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

  const refreshItem = useCallback(
    async (id: string) => {
      const encrypted = await vault.getByItemId(id);

      if (!encrypted || encrypted.deleted_at) {
        itemsMapRef.current.delete(id);
        fingerprintMapRef.current.delete(id);
      } else {
        const decrypted = await decryptItem(encrypted);
        itemsMapRef.current.set(id, decrypted);
        fingerprintMapRef.current.set(id, buildFingerprint(encrypted));
      }

      setRevision((r) => r + 1);
    },
    [vault],
  );

  const getItem = useCallback(
    (id: string) => itemsMapRef.current.get(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  );

  const value: ItemsContextValue = {
    items: Array.from(itemsMapRef.current.values()),
    getItem,
    ready,
    refreshItem,
  };

  return <ItemsContext value={value}>{children}</ItemsContext>;
}
