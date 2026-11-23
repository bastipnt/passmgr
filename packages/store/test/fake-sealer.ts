import { vi } from "vitest";
import { type RecordCiphertextRow, type RecordContent, secretsStore } from "../src/secrets-store";

function asItself({
  encryptedData,
  encryptionNonce,
  keyVersion,
}: Pick<RecordCiphertextRow, "encryptedData" | "encryptionNonce" | "keyVersion">): RecordContent {
  return { encryptedData, encryptionNonce, cryptoVersion: 1, keyVersion };
}

/**
 * Stand-ins for sealed rows (the crypto: `secrets-store.test.ts`): it has every key, seals and
 * redrafts a row as itself, counts a server row as sealed and as the draft's content.
 */
export const fakeSealer = {
  sealRecord: asItself,
  redraftRecord: asItself,
  hasRecordKey: () => true,
  isSealedRow: () => true,
  sameRecordContent: () => true,
};

/** Puts `fakeSealer` in place of `secretsStore`'s keys, for code that seals through it. */
export function installFakeSealer(): void {
  vi.spyOn(secretsStore, "sealRecord").mockImplementation(fakeSealer.sealRecord);
  vi.spyOn(secretsStore, "redraftRecord").mockImplementation(fakeSealer.redraftRecord);
  vi.spyOn(secretsStore, "hasRecordKey").mockImplementation(fakeSealer.hasRecordKey);
  vi.spyOn(secretsStore, "isSealedRow").mockImplementation(fakeSealer.isSealedRow);
  vi.spyOn(secretsStore, "sameRecordContent").mockImplementation(fakeSealer.sameRecordContent);
}
