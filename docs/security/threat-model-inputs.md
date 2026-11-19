# Threat model inputs: local vaults and device loss

Input for the security whitepaper (*Security whitepaper (threat model + key hierarchy)*). It covers
what offline-first (ADR 0001) changed: a vault can live on a device only, and every device keeps
a full encrypted copy of its profiles. The key hierarchy and the server side are described in
`CLAUDE.md` (Key Hierarchy, Authentication Flow, Request Authentication).

## Assets on a device

One SQLite database per profile (web: OPFS via SQLocal; mobile: expo-sqlite in `Documents/SQLite`
/ `files/SQLite`) plus the device registry (`pass-mgr-profiles`).

| Data | Protection |
| --- | --- |
| Record payloads, vault name/icon/colour | XChaCha20-Poly1305 under the vault key, AAD binds `cryptoVersion/stage/vaultId/recordId` and, for a synced (sealed) version, its `version/keyVersion/state` (records), or `vaultId` (meta). Unsent versions (drafts) bind only record and vault; the stage follows from `syncState`, never from the server |
| Vault keys, X25519 private key | wrapped by the account key (AAD: `vaultId` + `keyVersion` / `keyVersion`) |
| Earlier vault keys (after a rotation) | each wrapped by the key that replaced it (AAD: `vaultId` + `keyVersion`); whoever holds the current key opens them all |
| Vaults lost or left with unsent changes (`revoked_vaults` / `revoked_records`) | the vault's last wrap and chain (as above) and the latest unsent version of each record, under the vault key, until the user copies or discards them |
| Pinned peer keys (`peerKey:<userId>`), removed members (`removedPeer:<vaultId>:<userId>`) in `key_material` | plaintext public keys of other users this device shared with, and whom it removed from which vault (who you share with is visible) |
| Account key | wrapped by the Argon2id password KEK, and by the recovery KEK (needs the recovery key to open): `local` profiles keep that recovery wrap + the recovery verifier, `linked` ones the server's recovery wrap without the verifier, refreshed by every login (since 2026-10-23, for a password reset offline) |
| Pending recovery (`pendingRecovery` in `key_material`; a `linked` profile's password reset made on the device, until the server took or refused it) | XChaCha20-Poly1305 under the account key (AAD `passmgr/pending-recovery/v1`): the old recovery key's proof (`recoveryAuthKey`, never the key) and the new key set (password + recovery wraps, verifier) |
| Web biometric enrollment | account key, wrapped with a WebAuthn-PRF-derived key (`packages/crypto/src/biometric.ts`), plus the credential id. A linked profile logs in to the server with the credential itself (device login: the server holds its public key, the private key stays in the authenticator), so nothing stored on the device logs in |
| Mobile login bundle | account key (+ optional server session) in Keychain / Keystore, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, read behind the OS biometric/passcode prompt; plus an unguarded marker item per profile that only says a bundle exists (no key material) |
| Mobile autofill entries (only while the OS has the app's autofill on) | per profile, every login with a password (title, username, password, website hosts) in one file, encrypted to a device-only key: iOS a Secure Enclave P-256 key (ECIES), `WhenPasscodeSetThisDeviceOnly` + `biometryCurrentSet`; Android a Keystore RSA key wrapping a per-write AES-GCM key, strong biometric, usable 15 s after it, invalidated by a new enrollment. App group / `noBackupFilesDir`, excluded from backups. Kept across a lock, dropped on sign out (here or from another device), profile removal, recovery / password change (`forgetQuickUnlock`) and, once the profile is next open, when the OS autofill is off. iOS also hands the system a username + host per login (QuickType bar suggestions, `ASCredentialIdentityStore`), no password |
| Mobile autofill "Create login" / "Save to Passmgr" (pending logins) | a login created or saved in the OS autofill (title, website, username, password), one file each, named `<profileId>.<loginId>.pending`, encrypted to the same device key as the autofill entries (encrypting needs no prompt; plaintext only in the extension / activity while the form is open). Same directory, excluded from backups. Read by the app behind a biometric prompt on its next unlock, written into the vault (outbox) and deleted. Dropped with the profile, and with the device key (a new biometric enrollment) — a login created then is lost from Passmgr, though the site already has it. Android passes a save's typed username / password through the system to the save form (`PendingIntent`, as the system's own `SaveRequest` does), and the fill list hands the profile labels and generator settings to the create form the same way |
| Known vaults (`known_vaults`) | plaintext: every vault id this device accepted, its kind and the highest key version seen, kept after the vault goes (continuity checks on the server's vault list) |
| Breach check results (`breach_checks`, `profile_settings`; only once the user turned the check on) | plaintext: which record versions' passwords are in known breaches and how often, and when they were checked; no password, hash or hash prefix |
| **Plaintext metadata** | email (`profile`, registry), local vault display name, record and vault ids, vault kind and role, record version counts, timestamps (created/updated/deleted, `clientUpdatedAt`, `lastUsedAt`, `lastExportAt`), sync state and outbox bookkeeping |

The mobile share extension / `ShareActivity` store nothing: the shared text goes to the app in a
`passmgr://share` link (any app can open one), and only prefills a new login the user still has to
save; while locked it waits in memory until the unlock.

Keys in memory: web holds them in memory only (a reload locks); `secretsStore.wipe()` / lock
clears them, and a lock drops the decrypted records, the vault list and the cached password ratings
(`RecordsProvider`; a decryption still running when it locks is discarded). The master password is never kept after an unlock: OPAQUE only ever gets
`deriveOpaquePassword(password, email)`, and that buffer is what a linked profile keeps (wiped on
lock, once online, or after biometric enrollment) to reconnect; it is never stored. It logs in to the account, and a weak
master password can be brute-forced from it (one HKDF per guess). JavaScript gives no guarantee
that strings (the master password while typed, the base64 handed to opaque-ts for one login) are
gone.

## Local-only vault (`local` profile)

- **No server copy.** The device database is the only copy. Losing the device, clearing site
  data, browser eviction of OPFS (mitigated by `navigator.storage.persist()`, not prevented) or
  "Remove from device" loses the vault unless an export exists. Mitigations: backup reminder
  every 7 days without an export (`isBackupReminderDue`), encrypted export, "Create online
  account" (ADR 0001 D9, D12).
- **No rate limit on guessing.** Unlock, password change and recovery all run on the device, so
  the only brake on guessing the master password is Argon2id. A copy of the database allows
  unlimited offline guesses against the password wrap. Its cost is the set the creating device
  could afford (`PASSWORD_KEK_PARAM_SETS`): 128 MiB × 3, or on a slow device the floor of
  64 MiB × 3 (both p = 4).
- **Recovery on the device.** The recovery wrap is stored next to the password wrap. Either the
  master password or the recovery key opens the account key; the recovery key is never stored.
- **No server-side revocation.** Nothing can be revoked remotely: a stolen copy stays as strong
  as the master password it was taken with, even after a password change on the device.

## Linked profile (account on the device)

Same local copy as above, so the same offline-guessing exposure: the cached password wrap is the
one the server holds (the account key wrap is the same on every device), so a device copy is as
useful to an attacker as the server's key set. Additionally:

- A password change or recovery elsewhere rewraps the account key; an old device copy still
  opens with the **old** password, and with it the vault keys of that time. A password change
  doesn't rotate vault keys; rotating a vault's key (Settings → Vaults) does: the live records are
  re-encrypted under the new key and the server takes no new ciphertext under the old one, so an
  old copy's keys open only what existed before the rotation (history versions stay under the old
  key, and a device's copy of them stays readable).
- **Server copy of old wraps.** The server closes the replaced key set (old password wrap, old
  recovery wrap and verifier) and deletes it `KEY_SET_RETENTION_DAYS` (default 14) later, in the
  hourly purge (`purgeClosedKeySets`). Until then a database leak can still be cracked with the
  old password or opened with the old recovery key; database backups keep it as long as they
  are retained.
- **Password reset on the device** (ADR 0001 D10, amended 2026-10-23). The cached recovery wrap
  lets the recovery key open the account key without the server, as for a `local` profile. That
  adds no new secret: the recovery key could always take the account over through the server, and
  the server hands the same wrap to anyone who proves the key at `startRecovery`; without the key
  the cached wrap is as hard to open as the server's. Offline, the reset leaves a pending
  recovery on the device; whoever holds the account key can read its proof and finish the
  account's recovery on the server (new server password, every session revoked). That adds account
  takeover to someone who can already read every record; it never yields the recovery key. Online
  the server takes the reset before the device stores anything, so nothing is left pending. Until a
  pending reset reaches the server, other devices and the server still accept the old password, and
  this device never falls back to a server login with it.
- The device doesn't take the server's vault list on trust (`docs/architecture/vaults-and-sync.md`, vault list
  continuity): a lowered key version (a key a removed member still knows) or a moved personal vault is refused,
  and several vaults vanishing at once wait for the user. A device that never synced before (a new login) has no
  history to compare with, and one vault dropped at a time is indistinguishable from a removal.
- Signing out ends the server session and keeps the local data; only "Remove from device"
  deletes the database file (a file delete, not a secure erase).
- Unsynced changes exist only on the device until the outbox is pushed; removing the profile
  warns with their count.
- Deleting a record keeps it in the trash with its full history. "Delete for good" (purge) drops
  the history from this device, then from the server and each other device as they sync; a device
  that stays offline keeps its copy until it syncs, and rows deleted from SQLite / Postgres aren't
  securely erased (free pages, WAL, backups may still hold them).

## A server that tampers with record history

Every version a push sends is sealed (ADR 0001 D11, amended 2026-11-16): its AAD binds the record,
vault, version, key version and state (live / deleted / moved / purged), so the server can't serve an
old ciphertext as a newer version (a password rolled back), copy content into a tombstone, or move it
to another slot; such a row doesn't open. A purge carries a seal of empty content, and a device takes a
pulled purge (which drops its copy of the history) only when that seal opens. Every pulled row opens as
sealed (the device knows it came from the server), so one can't pass for a draft. A device checks every
row the server sends, pulled or answering a push, before storing it, and ignores one that doesn't open
as sealed for the slot, key version and state it claims, or that rewrites a version it holds with other
ciphertext. A push answer must also be the change sent (same record and vault, at or below its version,
same content). What stays accepted:

- **Withholding.** Cursors and pages are the server's choice: it can leave out versions, whole records
  or a vault's latest changes, and a device can't tell. A version it withholds also can't be rolled
  back to by replay, only frozen at an older state.
- **Held-back vaults.** A row under a key version the device hasn't loaded is held back with its whole
  vault (cursor included) until the key arrives; a server claiming a key version that never comes
  only freezes that vault, a form of withholding. Vaults sorted after it in a page wait behind it.
- **Replayed retries.** A push answer may be an earlier sealed copy of the same content (a lost answer's
  retry); the device accepts it in a lower slot, which is the server's numbering anyway.

## Breach check (HIBP)

Opt-in per profile on each device (Pass Monitor → Breached passwords), off by default, in every
mode (a `local` profile too: HIBP is a third party, not our server). With it on, the open Pass
Monitor asks the HIBP range API (`api.pwnedpasswords.com`, the one third-party host in the web CSP's
`connect-src`; `img-src` also allows the website icons host, below) about each login / Wi-Fi password without a result or with one 30 days old.

- **What leaves the device:** the first 5 hex characters of each password's SHA-1, with
  `Add-Padding` so the response size doesn't tell how many suffixes matched. HIBP (and anything
  on the path that breaks TLS) sees the device's IP address, the prefixes and their timing: the
  set of prefixes from one IP narrows each password to one of ~hundreds of thousands of known
  hashes per prefix, but a password not in the corpus stays unknown.
- Our server sees nothing of it; the requests go straight from the client.
- Results are stored on the device only (never synced), per record version; turning the check off
  deletes them.

## Website icons (DuckDuckGo)

Opt-in per device (Settings → General → Show website icons), off by default, in every mode. With it
on, each shown login asks `icons.duckduckgo.com` for its first website's favicon.

- **What leaves the device:** the host name of each saved login that is rendered (list rows, detail,
  a website field once left, never while typing), with the device's IP address and timing:
  DuckDuckGo (and anything on the path that breaks TLS) learns which sites the user has logins for.
- Our server sees nothing of it; off, no request is made.

## Two-factor (TOTP + backup codes)

Opt-in per account (Settings → Security). It gates the **server login** only: with it on, a correct
OPAQUE finish yields no session and no key material until `login.verifySecondFactor` gets a TOTP
code (±1 step, each step once) or an unused backup code. Someone with a phished / reused password
but no authenticator can't pull the password wrap or the vault ciphertext from the server.

- **Not a device lock.** A profile cached on the device still unlocks with the master password
  alone (offline-first, ADR 0001); the device copy is exactly as exposed as without two-factor.
  The code is asked only when the device talks to the server (sign-in, reconnect, fresh login).
- **No help against a compromised server or database**, and not phishing-resistant: a code typed
  into a fake page can be relayed live within its window.
- At rest the TOTP secret is encrypted under HKDF(`OPAQUE_SERVER_SETUP`, `totp-secret`); backup
  codes are stored as HMACs under HKDF(`OPAQUE_SERVER_SETUP`, `backup-code`). A database dump alone
  yields neither; with the server key, both.
- A wrong code counts against the account's login throttle (`loginlock:<emailHash>`); five burn the
  challenge. Recovery keeps two-factor on (a lost authenticator → backup code).
- Sessions created before two-factor was turned on stay valid until they end; turning it off or
  issuing new backup codes needs a fresh login that passed a code.
- Keeping this account's TOTP secret only inside this vault locks the user out once no device is
  signed in; the UI warns against it.

## Device loss / theft scenarios

| Attacker has | Gets |
| --- | --- |
| Locked device, no OS unlock | Whatever OS disk encryption leaves (web: OPFS has no encryption of its own; mobile: data protection class, Keychain `THIS_DEVICE_ONLY`) |
| The database file (disk image, OS backup, browser profile copy) | Plaintext metadata above; offline Argon2id guessing against the master password |
| OS backup (iCloud / Finder / Android Auto Backup) | Same as the database file; Keychain/SecureStore items are excluded, so no login bundle |
| Unlocked phone with the app's biometric | The vault (login bundle → account key); the logins with a password through autofill, even after a password change until the next unlock |
| Unlocked browser session (vault open) | The vault; an export additionally asks for the master password |
| Plain JSON / CSV export file | Everything in it, unencrypted (behind a warning, not counted as a backup) |
| Encrypted export file | Offline Argon2id guessing against the export password (independent of the master password) |
| Emergency kit (printed page or its PDF, with the email and server for an account) | The recovery key: a profile's vault with a copy of its database (a local one's, and since the offline reset a linked one's, whose recovery wrap is cached); an account's master password reset (`recovery.startRecovery`, needs only email + key) and with it the vault, unless two-factor stops the login after. The PDF is built on the device and never uploaded; web leaves it in the downloads folder, mobile hands it to the print sheet as a data URI (no file written by the app; what the OS print service caches is outside its control) |

## Open items affecting the model

- Web biometric device login: no attestation is checked, so the server can't tell a platform
  authenticator from a software one or a synced passkey; JavaScript running on the app's origin can
  still trigger the prompt (see web served-code trust below).
- Argon2 parameters are chosen per device from fixed sets, down to a 64 MiB × 3 floor; the web
  (WASM Argon2) reaches the strong set on a laptop, but lands on the floor where the WASM can't run
  (pure-JS fallback). A wrap is only redone below the floor, so an
  account wrapped on a slow device keeps the floor cost until a password change elsewhere.
- Sharing (ADR 0001 D7): removing a member, a member leaving or declining marks the vault
  `keyRotationNeeded`; the removing device rotates at once, otherwise the next owner or manager
  online does. Until then the server takes puts under the old key; the removed member has no server
  access, so only a server leaking ciphertext to them exposes that window. History versions keep the
  old key, so a rotation protects what is written after it, not what was read before.
- Public keys come from the server. Each device pins the key it first used for another user
  (TOFU; the inviter's and invitee's after comparing fingerprints out of band) and refuses a
  different one later. A malicious server can still substitute keys on first contact if users
  don't compare fingerprints.
- A removed member knows the vault key from before the rotation and their own (pinned) private
  key, so together with a malicious server they could chain and seal a forged "rotated" key. A
  device only accepts a key update from a sender the server lists as an active owner or manager
  with the pinned key, and never from someone this device removed from that vault
  (`removedPeer:` marks). What stays open: a server that lies about the membership to devices that
  didn't do the removal themselves. Closing that needs a member-signed membership log.
- Web served-code trust: a compromised web host can ship code that exfiltrates keys after unlock.
  The build pins the app's code to `index.html` and `sw.js` (SRI on the entry tags, an SRI hash per
  precached file in the service worker, checked on install) and the release attaches `SHA256SUMS` of
  the whole build to the GitHub release (`pnpm --filter web verify:deployment <url> <sums>`). That detects a
  tampered deployment and makes a swap all or nothing, it doesn't prevent it: the host serves
  `index.html` and `sw.js` themselves, and nothing in the browser checks them against the release.
  Lazy chunks fetched before the service worker is installed (first visit) have no SRI. For
  high-value vaults prefer the mobile app (code signed by the store). Details: `web-served-code-trust.md`.
