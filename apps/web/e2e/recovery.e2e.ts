import { test } from "@playwright/test";

test.skip("register → forget password → recover with recovery key", // `packages/client/src/register.ts` derives a recoveryKEK, but there is no // `encryptedVaultKeyRecovery` + `vaultKeyEncryptionNonceRecovery`, and // Recovery UI is not yet built. The server schema stores
// /recovery route, no UI to enter the key, and no server procedure that
// resets the password using it. Enable this test once those land.
() => {
  // intentionally empty
});
