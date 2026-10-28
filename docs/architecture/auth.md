# Authentication, sessions and account security

Cross-cutting flows (`packages/client`, `packages/store`, `apps/server`, web + mobile UI). Server request signing and the
router list are in `apps/server/CLAUDE.md`; the key hierarchy in the root `CLAUDE.md`.

## OPAQUE

OPAQUE is `@cloudflare/opaque-ts` (P-256, scrypt KSF from `@repo/crypto/services/opaque-ksf`). It never gets the
password: every registration, login, password change and recovery passes `deriveOpaquePassword(password, email)`
(HKDF, `opaqueInputFor` / `loginWithOpaquePassword` in `packages/client`). That buffer, not the password, is what
`secretsStore` keeps (`keepOpaquePassword`, wiped on lock) for the reconnect (and to get online for a pending web
biometric enrollment); it is never stored.

## Web biometric unlock and device login

Web biometric unlock (`useEnrollBiometric`, `biometricUnlock`): the WebAuthn PRF output wraps only the account key.
A linked profile also registers the credential's public key (`user.registerDeviceCredential`, fresh password login,
`device_credentials`; `biometricDeviceLogin` in the material), and the same prompt then signs a device login:
`login.startDeviceLogin` (nonce + server ephemeral X25519, `devicelogin:<attemptId>`, 5 min) → the WebAuthn challenge is
`deviceLoginChallenge(nonce, serverPub, clientPub)` → `login.finishDeviceLogin` (assertion checked in
`apps/server/src/auth/webauthn.ts`: origin in `allowedOrigins`, rpId hash, UP + UV, signature, growing counter;
session key = HKDF of the X25519 secret, `deviceSessionKey`), then two-factor as for a password login. Such a session is
`passwordless`: never fresh auth and no reset of the password throttle. A credential stops logging in
`SESSION_MAX_AGE_MS` after its last password login (`passwordVerifiedAt`); `useLinkDeviceCredential` (unlocked tree) links it
to every session of the device (`user.linkDeviceCredential`, a password session also renews it). Revoking a session deletes
its device's credential (`Session.deviceCredentialId`), revoke-others every other one, a password change / recovery all of
them; a credential the server refuses is forgotten on the device (`useDeviceLogin`), so enrollment is offered again.
`useBiometricUnlock` prepares the login before the click (Safari's gesture window); there is no automatic reconnect after
a biometric unlock (it needs the prompt): `useReconnect` reconnects through it when no OPAQUE password is kept.

## Registration and login

Registration:

1. Client: `OpaqueClient.registerInit` → sends `registrationRequest` to server
2. Server: `opaqueServer.registerInit` → returns `registrationResponse`
3. Client: `registerFinish` → generates `registrationRecord` + key hierarchy: a new account key wrapped twice (password KEK, recovery KEK), the personal vault (`createVault`: client-generated `vaultId` + vault key wrapped by the account key) and the X25519 keypair (`createUserKeyPair`: private key wrapped by the account key)
4. Server: stores `registrationRecord`, the key set, the keypair (`user_key_pairs`) and the personal vault (`vaults` + owner row in `vault_members`) in one transaction

Login:

1. Client: normalizes the email (`normalizeEmail`, also enforced server-side by `emailSchema`), `OpaqueClient.authInit` → sends `startLoginRequest` (KE1)
2. Server: per-account throttle check (`loginlock:<emailHash>`; every start counts, reset on success), `opaqueServer.authInit` → returns `loginResponse` (KE2) + `attemptId`, stores the `expected` auth result in Redis under `login:<attemptId>` (5 min, single-use, with its `startedAt`: a login started at or before `sessionepoch:<userId>` is refused at finish / second factor, `isLoginRevoked`). Unknown emails get a KE2 from a deterministic fake record (`auth/fake-record.ts`) — no enumeration
3. Client: `authFinish` → derives `sessionKey`, sends KE3 + `attemptId` + a random `authSalt`
4. Server: `opaqueServer.authFinish` → verifies, derives `authKey`. Two-factor on (`user_totp` row): no keys and no session yet, the
   challenge goes to Redis (`login2fa:<challengeId>`, 5 min, the derived `authKey` inside) and the answer is `{ secondFactorRequired, challengeId }`;
   `login.verifySecondFactor` takes a TOTP code (±1 step, step > `lastUsedStep`) or a backup code, a wrong one counts against
   `loginlock:<emailHash>`, `SECOND_FACTOR_MAX_ATTEMPTS` burn the challenge (`SECOND_FACTOR_INVALID` / `_EXPIRED`), then continues as below
   (session marked `secondFactor`). Otherwise it creates the session in Redis (24h sliding TTL, hard cap `SESSION_MAX_AGE_MS` = 30 days from `authenticatedAt`; indexed per user in `usersessions:<userId>`, a sorted set by last activity; `deviceName` from the client's `x-device-name` header, `ClientProvider`'s `deviceName`), returns `sessionId` + the wrapped account key + its recovery wrap (`recoveryKeys`, null without a verifier; cached for an offline reset) + `vaultKeys` (one wrap per live vault membership) + the current `userKeyPair`
   Client: `loginUser`'s `onSecondFactor` prompt (`SecondFactorPrompt`, only called when challenged; `null` → `SecondFactorCancelledError`).
   Login forms pass their own (`useSecondFactorRequest`: web `LoginPage` inline step, mobile sheets); every other login (reconnect,
   `freshLogin`) uses `SecondFactorPromptProvider` (web `SecondFactorPromptRoot` dialog; mobile has none, so a background reconnect
   gives `second_factor` and the user signs in again from Settings). `registerLocalVault` never asks (`noSecondFactor`)
5. Client: `secretsStore.unlockSession()` derives `sessionSecret` and `authKey` from `sessionKey` via HKDF; `unlockVault()` then unwraps the account key with the Argon2id password KEK (KEK derived in a worker) and the vault keys and the keypair with the account key (`secretsStore.loadVaultKeys` / `loadUserKeyPair`, which checks the private key against the public key; a personal vault key or keypair that doesn't open fails the unlock, any other vault whose key doesn't open is skipped and its records stay hidden). All of it is cached in the account's profile database for offline unlock (`StoreProvider.openAccountProfile`: the profile of that `userId`, or a new one next to the others; never a wipe). Signing in with the email of a profile on the device unlocks it locally like picking it (`useUnlock().unlockByEmail`). Memory only on web; mobile persists the session bundle per profile in Keychain/Keystore (restored behind the OS biometric prompt on launch, `useSessionRestore`, and after a lock by the welcome screen's `BiometricUnlockButton`, `useBiometricRestore`; `hasLoginBundle` reads a prompt-free marker)

## Session modes

Session modes (ADR 0001 D2, `SessionProvider`): unlocking never needs the server; server auth is attached
separately. `local` = a `local` profile, never talks to the server (no `authKey`, no sync). `online` = a `linked`
profile with server auth attached: signed requests, `SyncManager` enabled, SSE subscribed. `offline` = `linked`
without server auth (not attached yet, or a session that expired: `UNAUTHORIZED` only detaches). A session ended
on purpose (signed out from another device, password changed or recovered elsewhere) is refused with message
`SESSION_SIGNED_OUT` (`isSignedOut`) or a `signedOut` SSE event: the device locks like Sign out
(`StoreProvider.signedOut` → `onSignedOut`; web reloads and shows a note), its outbox stays. Web lock (`useLockVault`, `features/records/lock-vault.ts`) ends the server session best-effort
(`endServerSession`: aborted after `END_SERVER_SESSION_TIMEOUT_MS`; the page goes hidden + inert meanwhile) before the reload: the keys are memory-only, so nothing could reuse it; mobile lock keeps it
(the persisted bundle restores it). Losing the network does **not** change `mode`: it sets the separate `networkOffline` flag (`navigator.onLine`
/ `online`·`offline` events), which pauses sync and SSE; `summarizeSync` combines both. Writes go to the local
database + outbox in every mode; the `online` event (or attaching server auth) syncs.

## Recovery

Recovery (forgotten password, `auth/recovery-router.ts`):

1. Client: parses the recovery key, derives `recoveryAuthKey = HKDF(recoveryKey, "recovery-auth")`, `registerInit` (OPAQUE password of the new one) → `recovery.startRecovery`
2. Server: checks `SHA-256(recoveryAuthKey)` against `keys.recoveryVerifier` (constant time; unknown email / no verifier / wrong key all give the same `UNAUTHORIZED`), `registerInit` → returns `registrationResponse`, the recovery-wrapped account key and an `attemptId` (`recovery:<attemptId>`, 5 min, single-use, bound to the active `keySetId`)
3. Client: unwraps the **existing** account key with the recovery KEK, `registerFinish`, `generateUserKeys(newPassword, accountKey)` (new password wrap + **new** recovery key + verifier; vault keys untouched) → `recovery.finishRecovery`
4. Server: in one transaction closes the key set, inserts the new one and replaces `users.registrationRecord`; then `revokeUserSessions` (`sessionepoch:<userId>` — `getSession` rejects sessions authenticated before it). Accounts without `recoveryVerifier` (pre-recovery registrations) cannot recover

Local recovery (`local` profile, ADR 0001 D10): `useRecovery().recoverLocal` → `recoverLocalVault` unwraps the account key
with the recovery wrap kept on the device, `generateUserKeys` → `Vault.setLocalKeyMaterial` replaces both wraps
atomically; no server.
Linked profile on the device (D10 amended 2026-10-23, always local-first, online too): `useRecovery().recover` →
`recoverLinkedVault` with the recovery wrap cached from the last login → `Vault.setLinkedRecovery` (new password wrap, new
recovery wrap and a *pending recovery*: the old key's `recoveryAuthKey` + the new key set, sealed under the account key,
`sealPendingRecovery`; a second reset keeps the first proof). Online it goes to the server before anything is stored
(`finishPendingRecovery`; refused: nothing changes, so a stale cached wrap can't diverge); offline or unreachable, the next
connect with the new password finishes it before the login (`useConnectServer`); throttled / unreachable keeps it, a refusal
drops it. While pending, `unlockLocal` never falls back to a server login (the old password must not undo it); a login's key
set drops it. `summarizeSync` shows "Password reset waiting". A key the cached wrap doesn't open goes to the server when online;
an account without a cached wrap still needs the server (`offline`).
Web `RecoverPage` (`authPaths.recover` from the account login, `recoverActive` from the unlock card): key step
(`checkRecoveryKey(key, email?)`: unwrapped when the device has the wrap, else format only and the server checks it with
the new password), then the new password, the new key (`RecoveryKeyDialog`), then the vault opens with the new password.

## Password change

Password change (ADR 0001 D10, `useChangePassword`, one hook for both modes): `local` → `changeLocalPassword`
(current password checked against the stored wrap, account key rewrapped on the device). `linked` → only `online`,
blocked otherwise: `changeAccountPassword` does a fresh OPAQUE login with the current password (for `freshAuthProcedure`),
`user.startPasswordChange` (new OPAQUE registration; the email must be the session user's) and `finishPasswordChange`
(attempt `passwordchange:<attemptId>` bound to the active `keySetId`; new key set with the recovery wrap carried over,
new `registrationRecord`, `revokeUserSessions`), then the client logs in again with the new password (`useConnectServer`).
Both modes drop the biometric enrollment (the server deletes its credential); recovery key and vault keys stay.

## Two-factor

Two-factor (TOTP + backup codes, opt-in; `useTwoFactor`, web Settings → Security `TwoFactorSettings`, mobile `TwoFactorSection` /
`TwoFactorSheet`): `user.startTotpEnrollment` (fresh login; secret in Redis `totpenroll:<userId>` 10 min, returns `otpauth://` URI +
base32) → `confirmTotp({code})` (stores `user_totp` with the code's step used + 10 `user_backup_codes`, shown once);
`disableTotp` / `regenerateBackupCodes` need a fresh login that passed a code (session `secondFactor`). Secret encrypted
with HKDF(server key, `totp-secret`), backup codes HMAC'd with HKDF(server key, `backup-code`) (`apps/server/src/auth/two-factor.ts`).
Gates the server only: a cached profile still unlocks with the password. Recovery keeps it on; account deletion cascades.

## Account deletion

Account deletion (`useDeleteAccount`, `linked` + `online` only; web Settings → Account & sync): a fresh OPAQUE login
(`freshLogin`) then `user.deleteAccount` (`apps/server/src/user/delete-account.ts`), a hard delete in one transaction:
user row → cascades to key sets, keypair, memberships and every vault it owns (personal + soft-deleted) with their
records. Shared vaults: nobody else active → deleted; the user is the only active owner of one others are in →
`PRECONDITION_FAILED` `sole_owner` (the vaults in `data.vaultIds`, `SoleOwnerCause` via the `errorFormatter`), nothing deleted; otherwise the user leaves (`keyRotationNeeded`, `ownerId`
handed to another owner) and their versions stay with `records.userId` null. Unaccepted invites they sent are dropped.
All sessions end; the client locks and removes the profile from the device.

## Emergency kit

Emergency kit (`createEmergencyKit` / `useEmergencyKit`, `packages/client/src/account/emergency-kit.ts`): a one-page
PDF (pdf-lib, loaded on demand) with the email + server (an account; none for a local vault), a write-in field for the
master password and the recovery key (`recoveryKeyChunks`, the groups both dialogs show). Built on the device only, and
only where a recovery key is issued (`RecoveryKeyDialog`: register, local vault, restore, recovery): it can't be made
later, the key isn't kept. Web downloads it (counts as saved once handed over); mobile opens the print sheet (`expo-print`, data URI, the
dialog hidden meanwhile on iOS), which counts only on iOS, where a cancelled print rejects. The server is printed
as a full URL (web may be configured with a path, `/trpc`).
