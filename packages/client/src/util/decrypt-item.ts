import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import type { ItemSchema } from "@repo/schema";
import { secretsStore } from "@repo/store";

export function decryptItem(encryptedData: string, encryptionNonce: string): ItemSchema {
  const bytes = secretsStore.decryptItem(encryptedData, encryptionNonce);
  return JSON.parse(new TextDecoder().decode(bytes)) as ItemSchema;
}

export function decryptItemWithWorker(
  encryptedData: string,
  encryptionNonce: string,
): Promise<ItemSchema> {
  return decryptWorkerService.decrypt(encryptedData, encryptionNonce);
}
