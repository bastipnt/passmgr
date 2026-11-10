# Local vaults, backup, import and linking

Local vaults (no server, ADR 0001 D2), durability, export / import, import from other managers, and linking a local
vault to an account. Code mostly in `packages/client` (hooks, `src/import/`) and `packages/store`.

## Local vault, durability, export and import

Local vault (no server, no account; ADR 0001 D2): `useCreateLocalVault` → `generateKeyring` (same
keyring as registration) → `Vault.createLocalVault` stores a `local` profile, the password wrap, the
recovery wrap + verifier (the verifier on local profiles only) and the personal vault atomically, in a new profile
database next to any others (optional display name). Unlock is password-only (`unlockLocal`), Argon2 rekey happens on the device.
Durability (ADR 0001 D12): web asks `navigator.storage.persist()` on create (`StorageSettings` shows it);
a `local` profile gets a backup reminder (`useBackupReminder`, from the registry's `lastExportAt` —
`ProfileStore.markExported`). Mobile databases are in iCloud / Android Auto Backup
(`apps/mobile/plugins/with-android-backup.js`), SecureStore values are not.
Export (`useExport`, ADR 0001 D12 amended): encrypted backup (`ExportEnvelope`: Argon2id over an export
password + XChaCha20, `decryptExport` reads it back; moves `lastExportAt`) or plain JSON / CSV. Every format
re-checks the master password. Web: Settings → Security → Export.
Import (`useImport`, `importExportData`): an encrypted backup or plain JSON (`readExportFile` /
`openExportEnvelope`) into the open profile, re-encrypted per target vault and written through
`RecordRepository.writeImport` (outbox, batches of `IMPORT_BATCH_SIZE`). A record keeps its id only in the vault
it came from; an id already there (live or deleted) → skip / overwrite (new version, revives a deleted one; unchanged
content writes nothing) / keep both. Restore or import (`useRestoreBackup`, web `/restore`; the file opened by
`useOpenImportFile`): a backup or another manager's export (below) into a new local vault under a new master password,
every record into its personal vault, all with new ids (a restored vault can be linked next to an account that still holds the originals). A backup's records remember the file id in their encrypted payload (`importedFrom`, `trackOrigin`): importing the file again, or a copy exported from them, matches on it (skip / overwrite / keep both), edited or not; found in memory by decrypting the target vault, nothing is hashed or stored beside the ciphertext. Mobile has no export / import UI yet.
Import from other managers (`packages/client/src/import/`, same web Import dialog): `readImportFile` detects by content
(Chrome / Edge, Firefox, Safari CSV; Bitwarden JSON / CSV, CSV by its `login_uri` column; 1Password 1PUX via `fflate`, or
1Password 8 CSV by its `archived` column, checked before Safari's; KeePass XML via an injectable
`ParseXml`, web `DOMParser`; this app's own CSV export by its `vault,type,title` header, `own-csv.ts`: no ids, so all
new records in the one picked vault, the `vault` column dropped, custom fields come back as text) and refuses known-but-unsupported files with a how-to (`UnsupportedImportFileError`).
A KeePass database (KDBX 3.1 / 4) comes back as `kind: "kdbx"`: `openKeePassDatabase` (password + optional key file)
decrypts it on the device (`@repo/crypto` `openKdbx`, own reader on @noble: AES-KDF via WebCrypto, Argon2d / id through
`argon2WorkerService`; no Twofish) to its inner XML, then `importKeePassXml`. Fixtures: `packages/crypto/test/fixtures/kdbx`.
Each parser fills a `ForeignImportBuilder` → an `ExportData` of one vault, imported with `keep-both` into the picked
vault (every record new). Folders → tags, extra fields → custom fields, history / passkeys / attachments dropped and
counted in the report. App ids and other `scheme://` addresses stay websites (`parseWebsite` in `@repo/util`:
`web` / `app` / `uri`; only `web` is linked, favicon'd or matched by host). A failed batch throws `ImportStoppedError` (`written` / `total`).

## Demo vault (web demo build)

Web builds with `VITE_DEMO_MODE=true` (`apps/web/.env.production`, `Dockerfile.web` default) are the public demo
(`apps/web/src/features/demo`). The welcome offers only **Try the demo**: `useDemoVault().startDemo` creates a `local`
profile marked `demo` in the registry (`ProfileEntry.demo`, `ProfileStore.create`'s `demo`), named "Demo vault",
under the public `DEMO_PASSWORD` (Argon2 still runs), wipes its recovery key, unlocks with the account key in memory and
fills it with `demoSeed()` (`@repo/schema`: the dev seed's example records over `SEED_VAULTS`, shared with
`packages/db/devSeed.ts`, plus favorites, password history and trash) through `seedDemoVault`: the extra vaults, then
every version dated back (`RecordRepository.writeImport` / `delete` take an `at`, `Vault.writeLocalChanges` a `now`).
A new demo replaces the device's old one (removed once the new one is active). A demo profile never links:
`useLinkAccount` refuses it (`demo`), whatever the browser's demo mode; local profiles never sync anyway. Its sync
summary is "Demo (local only)" (`summarizeSync`'s `demo`, `DEMO_VAULT_NOTICE`); Settings → Account & sync and the
phone's account sheet show the notice and offer no account or password change. In demo mode, import (every
`ImportDialog` trigger), create, account login, restore and recovery are gone (their routes go to the welcome);
export stays.

## Linking a local vault to an account

Linking a local vault to an account (ADR 0001 D9, `useLinkAccount`): password checked locally →
`registerLocalVault` registers the vault's **own** keyring (`localVaultKeyring`: stored wraps, verifier,
keypair, every vault via `finishRegistration`'s `vaults`; nothing re-encrypted, recovery key stays valid)
and logs in; the account must hold the vault's public key. Then `saveAccount` makes the profile `linked`
(keeps the login's recovery wrap, drops the verifier) **before** `linkServer` goes online: the first sync pushes the outbox,
which already holds every local version, so the upload resumes by itself. Repeating a half-done link is safe.
