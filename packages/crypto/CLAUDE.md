# packages/crypto

The key hierarchy diagram is in the root `CLAUDE.md`.

## Password KEK params and Argon2

Password KEK params (`@repo/crypto` `hash.ts`): each wrap stores its Argon2id params. A new wrap (register, local vault,
password change, recovery, export) takes this device's set from `PASSWORD_KEK_PARAM_SETS` (strongest that fits
`PASSWORD_KEK_BUDGET_MS`, measured once per run by `devicePasswordKekParams`, never below the 64 MiB floor). Unlock rekeys
only a wrap below the floor (`needsPasswordKekRekey`): the wrap is shared by every device, equal-params rekeying would ping-pong.
Tests pin params with `setPasswordKekParams` (skips calibration).
Every stored or received set of params (server login answer, the device's cached account key, an export file's `kdf`) is
checked against `argonParamsSchema` (`@repo/schema`); tests that derive with t:1 m:8 relax it with `setArgonBounds`
(server, client and web test setup).
Argon2id itself (`util/argon2-impl.ts`): web / Node run hash-wasm (WASM inlined in the bundle, needs
`'wasm-unsafe-eval'`), falling back to @noble per thread once the WASM fails; mobile `react-native-argon2`. Web derives in the
worker (`argon2WorkerService`; `generateUserKeys` takes it as `derive`), in-thread where there's no `Worker` (Node).
`argon2Async(variant, …)` also does Argon2d (KeePass import only); on mobile Argon2d and binary passwords run on @noble (JS thread).

## OPAQUE KSF

`services/opaque-ksf.ts` (`opaqueKsf`, passed to every `OpaqueClient`): scrypt N=32768 r=8 p=1, byte-identical to the
library's `ScryptMemHardFn` (`util/opaque-scrypt.ts`; changing it breaks every registration). Web runs it in the Argon2
worker (`argon2WorkerService.opaqueKsf`, same queue), in-thread without `Worker` (Node); mobile native scrypt
(`.native.ts`, react-native-quick-crypto). An async `harden` needs our patch of @cloudflare/opaque-ts
(`patches/@cloudflare__opaque-ts@0.7.5.patch`, awaits it): re-check it on every library upgrade.

## Password normalisation (NFKC)

Every derivation from a password goes through `normalizePassword` (NFKC): `genPasswordKek`, `deriveOpaquePassword`, and
in `packages/client` `derivePasswordKek`, the rekey and the export key. `retrievePRK` / `argon2idAsync` take the string
as given. No raw-form fallback. Details: `docs/architecture/auth.md`.

## Key buffers

The WebAuthn PRF output is wiped once the biometric KEK is derived (`biometricKekFrom`, zeroes the browser's buffer).
A login's session key stays bytes (`deviceSessionKeyBytes`, OPAQUE's `session_key`); `deriveSessionSecret` hashes its
base64 text (what the server derives from) from a wiped buffer, never a string.

## Wraps

Wraps are XChaCha20-Poly1305 with AAD (`packages/crypto/src/user-keys.ts`, `user-key-pair.ts`): the
account key's is purpose-only (`passmgr/account-key/v1`, same wrap on every device), a vault key's binds
`vaultId` + `keyVersion`, the private key's its `keyVersion` (`unwrapUserPrivateKey` also checks it
against the public key). Password change / rekey / recovery rewrap only the account key; the keypair
is created once and `generateUserKeys` never touches it. A public key is verified out of band by its
`publicKeyFingerprint` (30 digits).

Records: the AAD binds `cryptoVersion/stage/vaultId/recordId` (`src/vault-data.ts`), so a record never opens in another
vault; a `sealed` one also `version/keyVersion/state` (`recordCipherContext(row, stage)`). `cryptoVersion` is the format
(`RECORD_CRYPTO_VERSION`), not the stage: the store derives that from `syncState` (`storedRecordContext`). Drafts
(pending) are sealed at push (`secretsStore.sealRecord`, ADR 0001 D11 amended 2026-11-16).
