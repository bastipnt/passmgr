// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  createUserKeyPair,
  createVault,
  encryptRecordData,
  genKey,
  type RecordCipherContext,
  vaultKeyId,
} from "@repo/crypto";
import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import type { MemberVault } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { act, type ContextType, createElement, useContext } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionProvider, { SessionContext } from "../src/providers/SessionProvider";

// The main-thread service keeps the worker's message contract and runs in node.
vi.mock(
  "@repo/crypto/services/decrypt-worker-service",
  () => import("@repo/crypto/services/decrypt-worker-service.native"),
);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const unmounts: (() => void)[] = [];
afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount);
});
beforeEach(() => {
  secretsStore.lock();
  decryptWorkerService.wipe();
});

function renderSession() {
  const result = { current: undefined as unknown as ContextType<typeof SessionContext> };
  function Probe() {
    result.current = useContext(SessionContext);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(SessionProvider, null, createElement(Probe))));
  unmounts.push(() => root.unmount());
  return result;
}

function keyring() {
  const accountKey = genKey();
  const wraps: MemberVault[] = [
    { ...createVault(accountKey, { name: "Personal" }), kind: "personal", role: "owner" },
  ];
  return { accountKey, wraps, userKeyPair: createUserKeyPair(accountKey) };
}

/** A record sealed with the unlocked vault's key, through a copy of it from the secrets store. */
function sealedRecord(vaultId: string) {
  const context: RecordCipherContext = {
    recordId: "r-1",
    vaultId,
    cryptoVersion: 1,
    stage: "sealed",
    version: 1,
    keyVersion: 1,
    state: "live",
  };
  const key = secretsStore.exportVaultKeysForWorker().get(vaultKeyId(vaultId, 1));
  if (!key) throw new Error("vault key not loaded");
  const [encryptedData, nonce] = encryptRecordData(key, context, JSON.stringify({ title: "Mail" }));
  return { context, encryptedData, nonce };
}

function decryptInWorker({ context, encryptedData, nonce }: ReturnType<typeof sealedRecord>) {
  return decryptWorkerService.decrypt(context, encryptedData, nonce);
}

describe("SessionProvider and the decrypt worker", () => {
  it("seeds the worker on unlock and leaves it without vault keys after lock()", async () => {
    const session = renderSession();
    const { accountKey, wraps, userKeyPair } = keyring();
    act(() => session.current.unlockWithAccountKey("local", accountKey, wraps, userKeyPair));
    const record = sealedRecord(wraps[0]!.vaultId);
    await expect(decryptInWorker(record)).resolves.toEqual({ title: "Mail" });

    act(() => session.current.lock());

    await expect(decryptInWorker(record)).rejects.toThrow("No key for vault");
  });

  it("seeds the worker on a restored login, with no seeding by the caller", async () => {
    const session = renderSession();
    const { accountKey, wraps, userKeyPair } = keyring();
    act(() => session.current.unlockWithAccountKey("local", accountKey, wraps, userKeyPair));
    const record = sealedRecord(wraps[0]!.vaultId);
    const bundle = secretsStore.exportPersistableBundle();
    act(() => session.current.lock());

    act(() => session.current.restoreLogin("local", bundle, wraps, userKeyPair));

    await expect(decryptInWorker(record)).resolves.toEqual({ title: "Mail" });
  });
});

const CLIENT_SRC = join(import.meta.dirname, "../src");
// openVault seeds on every unlock; a changed vault list reloads the keys it holds.
const SEEDERS = new Set(["providers/SessionProvider.tsx", "providers/StoreProvider.tsx"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("decrypt worker seeding", () => {
  it("happens only in openVault and the vault-list reload, never by hand in an unlock path", () => {
    const seeding = sourceFiles(CLIENT_SRC)
      .map((path) => relative(CLIENT_SRC, path))
      .filter((path) => path !== "util/decrypt-record.ts")
      .filter((path) =>
        /\binitDecryptWorker\(|decryptWorkerService\.init\(/.test(
          readFileSync(join(CLIENT_SRC, path), "utf8"),
        ),
      );
    expect(seeding.sort()).toEqual([...SEEDERS].sort());
  });
});
