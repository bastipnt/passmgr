import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import type { ItemPayload } from "@repo/schema";
import { secretsStore } from "@repo/store";

export function decryptItem(encryptedData: string, encryptionNonce: string): ItemPayload {
  const bytes = secretsStore.decryptItem(encryptedData, encryptionNonce);
  return JSON.parse(new TextDecoder().decode(bytes)) as ItemPayload;
}

export function decryptItemWithWorker(
  encryptedData: string,
  encryptionNonce: string,
): Promise<ItemPayload> {
  return decryptWorkerService.decrypt(encryptedData, encryptionNonce);
}
