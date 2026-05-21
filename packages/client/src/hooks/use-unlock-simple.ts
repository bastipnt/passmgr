import type { VaultUnlockInfo } from "@repo/schema";
import { useContext, useState } from "react";
import { fromBase64 } from "@repo/util";
import { retrievePRK } from "@repo/crypto";
import { SessionContext } from "../providers/SessionProvider";

/**
 * Vault-less unlock for platforms without local persistence (e.g. mobile v1).
 * Derives passwordKek on the JS thread (no web worker) and unlocks the in-memory secretsStore.
 */
export function useUnlockSimple() {
  const [unlockError, setUnlockError] = useState(false);
  const { unlockVault } = useContext(SessionContext);

  async function unlock({ password, userPasswordKeys }: VaultUnlockInfo) {
    let passwordKek: Uint8Array;

    try {
      passwordKek = await retrievePRK(
        password,
        fromBase64(userPasswordKeys.passwordKekSalt),
        userPasswordKeys.passwordKekParams,
      );
    } catch (e) {
      console.error("Vault unlock failed", e);
      setUnlockError(true);
      return;
    }

    unlockVault(
      passwordKek,
      userPasswordKeys.encryptedVaultKey,
      userPasswordKeys.vaultKeyEncryptionNonce,
    );
  }

  return { unlock, unlockError };
}
