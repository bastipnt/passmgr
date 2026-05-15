import { decryptWorkerService } from "@repo/crypto/services/decrypt-worker-service";
import type { RecordSchema } from "@repo/schema";
import { secretsStore } from "@repo/store";

export function decryptRecord(encryptedData: string, encryptionNonce: string): RecordSchema {
  const bytes = secretsStore.decryptRecord(encryptedData, encryptionNonce);
  return JSON.parse(new TextDecoder().decode(bytes)) as RecordSchema;
}

export function decryptRecordWithWorker(
  encryptedData: string,
  encryptionNonce: string,
): Promise<RecordSchema> {
  return decryptWorkerService.decrypt(encryptedData, encryptionNonce);
}
