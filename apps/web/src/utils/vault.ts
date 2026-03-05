// TODO: not sure if this file should rather be in @repo/client

import { secretsStore } from "@repo/client";
import type { ItemPayload } from "@repo/schema";

export function encryptPayload(payload: ItemPayload): {
  encryptedData: string;
  encryptionNonce: string;
} {
  const [encryptedData, encryptionNonce] = secretsStore.encryptItem(JSON.stringify(payload));
  return { encryptedData, encryptionNonce };
}

export function decryptPayload(encryptedData: string, encryptionNonce: string): ItemPayload {
  const bytes = secretsStore.decryptItem(encryptedData, encryptionNonce);
  return JSON.parse(new TextDecoder().decode(bytes)) as ItemPayload;
}
