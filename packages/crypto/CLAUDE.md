# packages/crypto

The key hierarchy diagram is in the root `CLAUDE.md`.

## Password KEK params and Argon2

Password KEK params (`@repo/crypto` `hash.ts`): each wrap stores its Argon2id params. A new wrap (register, local vault,
password change, recovery, export) takes this device's set from `PASSWORD_KEK_PARAM_SETS` (strongest that fits
`PASSWORD_KEK_BUDGET_MS`, measured once per run by `devicePasswordKekParams`, never below the 64 MiB floor). Unlock rekeys
only a wrap below the floor (`needsPasswordKekRekey`): the wrap is shared by every device, equal-params rekeying would ping-pong.
Tests pin params with `setPasswordKekParams` (skips calibration).
Argon2id itself (`util/argon2-impl.ts`): web / Node run hash-wasm (WASM inlined in the bundle, needs
`'wasm-unsafe-eval'`), falling back to @noble per thread once the WASM fails; mobile `react-native-argon2`. Web derives in the
worker (`argon2WorkerService`; `generateUserKeys` takes it as `derive`), in-thread where there's no `Worker` (Node).
`argon2Async(variant, …)` also does Argon2d (KeePass import only); on mobile Argon2d and binary passwords run on @noble (JS thread).

## Wraps

Wraps are XChaCha20-Poly1305 with AAD (`packages/crypto/src/user-keys.ts`, `user-key-pair.ts`): the
account key's is purpose-only (`passmgr/account-key/v1`, same wrap on every device), a vault key's binds
`vaultId` + `keyVersion`, the private key's its `keyVersion` (`unwrapUserPrivateKey` also checks it
against the public key). Password change / rekey / recovery rewrap only the account key; the keypair
is created once and `generateUserKeys` never touches it. A public key is verified out of band by its
`publicKeyFingerprint` (30 digits).

Records: the AAD binds `cryptoVersion/vaultId/recordId` (`src/vault-data.ts`), so a record never opens in another vault.
