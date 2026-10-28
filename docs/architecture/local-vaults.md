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
every record into its personal vault; a backup's ids kept (`keepIds`: a re-import skips them), a foreign one's all new. Mobile has no export / import UI yet.
Import from other managers (`packages/client/src/import/`, same web Import dialog): `readImportFile` detects by content
(Chrome / Edge, Firefox, Safari CSV; Bitwarden JSON; 1Password 1PUX via `fflate`; KeePass XML via an injectable
`ParseXml`, web `DOMParser`) and refuses known-but-unsupported files with a how-to (`UnsupportedImportFileError`).
A KeePass database (KDBX 3.1 / 4) comes back as `kind: "kdbx"`: `openKeePassDatabase` (password + optional key file)
decrypts it on the device (`@repo/crypto` `openKdbx`, own reader on @noble: AES-KDF via WebCrypto, Argon2d / id through
`argon2WorkerService`; no Twofish) to its inner XML, then `importKeePassXml`. Fixtures: `packages/crypto/test/fixtures/kdbx`.
Each parser fills a `ForeignImportBuilder` → an `ExportData` of one vault, imported with `keep-both` into the picked
vault (every record new). Folders → tags, extra fields → custom fields, history / passkeys / attachments dropped and
counted in the report. App ids and other `scheme://` addresses stay websites (`parseWebsite` in `@repo/util`:
`web` / `app` / `uri`; only `web` is linked, favicon'd or matched by host). A failed batch throws `ImportStoppedError` (`written` / `total`).

## Linking a local vault to an account

Linking a local vault to an account (ADR 0001 D9, `useLinkAccount`): password checked locally →
`registerLocalVault` registers the vault's **own** keyring (`localVaultKeyring`: stored wraps, verifier,
keypair, every vault via `finishRegistration`'s `vaults`; nothing re-encrypted, recovery key stays valid)
and logs in; the account must hold the vault's public key. Then `saveAccount` makes the profile `linked`
(keeps the login's recovery wrap, drops the verifier) **before** `linkServer` goes online: the first sync pushes the outbox,
which already holds every local version, so the upload resumes by itself. Repeating a half-done link is safe.
