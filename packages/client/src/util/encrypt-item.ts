import type { ItemPayload } from "@repo/schema";
import { secretsStore } from "@repo/store";

export function encryptItem(payload: ItemPayload): {
  encryptedData: string;
  encryptionNonce: string;
} {
  const [encryptedData, encryptionNonce] = secretsStore.encryptItem(JSON.stringify(payload));
  return { encryptedData, encryptionNonce };
}
