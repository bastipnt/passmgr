// TODO: not sure if this file should rather be in @repo/client

import { secretsStore } from "@repo/client";
import type { ItemPayload } from "@repo/schema";
import { decryptWorkerService } from "./decrypt-worker-service";

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

export function decryptPayloadAsync(
  id: string,
  encryptedData: string,
  encryptionNonce: string,
): Promise<ItemPayload> {
  return decryptWorkerService.decrypt(id, encryptedData, encryptionNonce);
}
