import { test } from "@playwright/test";

// Recovery UI is not yet built. The server schema stores
// `encryptedVaultKeyRecovery` + `vaultKeyEncryptionNonceRecovery`, and
// `packages/client/src/register.ts` derives a recoveryKEK, but there is no
// /recovery route, no UI to enter the key, and no server procedure that
// resets the password using it. Enable this test once those land.
test.skip("register → forget password → recover with recovery key", () => {
  // intentionally empty
});
