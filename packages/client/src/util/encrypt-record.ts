import type { RecordSchema } from "@repo/schema";
import { secretsStore } from "@repo/store";

export function encryptRecord(payload: RecordSchema): {
  encryptedData: string;
  encryptionNonce: string;
} {
  const [encryptedData, encryptionNonce] = secretsStore.encryptRecord(JSON.stringify(payload));
  return { encryptedData, encryptionNonce };
}
