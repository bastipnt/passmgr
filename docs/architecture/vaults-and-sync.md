# Vaults, sync and sharing

Vault model, server access, sync / push, limits and quota, conflict merge, trash, key rotation, sharing and the vault UI.
Sync cursor background: `docs/sync-cursor.md`.

## Vaults and sync

Every record lives in one vault (`records.vaultId`, local + server) and is encrypted with that vault's key;
the AAD binds `cryptoVersion/vaultId/recordId` (`packages/crypto/src/vault-data.ts`), so a record never
opens in another vault — a move re-encrypts it as a new record and tombstones the source (both
pushed in one batch), whose history stays behind. Vault name/icon/colour are `encryptedMeta` (vault key, AAD `vaultId`).
`personal` = the default vault (one per user, `secretsStore.defaultVaultId`); every other vault is `shared`.
Server access is **membership-based** (`apps/server/src/vault/access.ts`: active `vault_members` row of a
live vault; roles `owner > manage > write > read`), never `records.userId` (that's the version's author).
Unknown and forbidden vaults both answer `NOT_FOUND`; a member with too low a role gets `FORBIDDEN`.
`record.sync` takes one cursor per vault (a vault without one is pulled in full) and returns the full
vault list plus at most `MAX_SYNC_RECORDS` versions in `(vaultId, seq)` order, `hasMore` when the page is
full (`SyncManager` pulls and applies page after page); the cursor is the vault's `records.seq`, taken from `vaults.lastSeq` (`takeVaultSeqs`, row
lock → commit order = seq order); every record insert must take one, never use `updated_at` as a
cursor. `record.push` is the only record write (`apps/server/src/record/push.ts`): one transaction,
vaults locked first (`lockVaults`, `lock_timeout` → `SERVICE_UNAVAILABLE`, the client retries), then
compare-and-swap per change on `baseVersion`; each change answers `applied` / `stale` / `rejected`,
a record's changes in a batch apply all or nothing, and `clientChangeId` (unique per record) makes a
retry return the stored version. `SyncManager` sends each record's chain in one batch (`pushBatches`, bounded by `MAX_PUSH_CHANGES` and `MAX_PUSH_BYTES`).
Limits (`@repo/schema` `record-limits.ts`): per-field max lengths and list sizes in the record schemas (forms show them; a
foreign import skips an item over them as `too_large`), the whole payload ≤ `MAX_RECORD_PAYLOAD_BYTES` (`encryptRecord`
throws `RecordTooLargeError`, `recordErrorMessage` shows it), `record.push` caps the ciphertext, the server body is
`MAX_REQUEST_BYTES`. Storage quota: `vaults.usedBytes` (each version's `pushChangeBytes`, tombstones included, kept by
`takeVaultSeqs` / `dropPurgedHistory`) summed over an owner's live vaults against `STORAGE_QUOTA_MB`; a chain with a put
past it is `rejected` `quota` (parked, `SyncStatus.storageFull`), and so is a `moved` tombstone in that batch (the move's
other half). Deletes and purges always apply; a rewrite of a record still under a rotated-out key is exempt. Writes trigger a debounced sync; a failed or incomplete round retries with backoff; a rejected change, or one failing `MAX_PUSH_ATTEMPTS` pushes, is parked (`outbox.parkedAt`, with its record's later changes) until `retryParked`; status via `useSyncStatus`; indicators (web `SyncStatusCard`, `syncCardLines`: desktop sidebar footer, phone `AccountSheet`, plus a dot on the phone's account button; mobile `useSyncHeaderItem`, Settings → Account & sync) read `useSyncSummary` / `summarizeSync` (offline is a state, not an error). `Vault.applySync` drops vaults the user lost (records + cursor) and a changed list reloads the keys into `secretsStore` and the decrypt worker (`SyncManager`'s `onVaultsChanged`).
A pull that collides with pending local versions merges field by field (ADR 0001 D5, `mergeRecord` /
`resolveRecordConflict`): the later `clientUpdatedAt` wins a field changed on both sides, an edit beats a
delete, and the local edits stay in the history below the merged version.

## Trash

Trash (`useTrash`, ADR 0001 D5 amended; web Settings → Trash `TrashPage`, mobile `settings/trash`): a
tombstone's `tombstoneKind` is null for a delete (in the trash), `moved` for a move's source, `purged` for
a record deleted for good. Restore = update with the tombstone's content (`RecordRepository.restore`).
Purge (`RecordRepository.purge` → `Vault.purgeRecords`) drops every local version + unsent change; a
record the server has leaves a contentless `purged` tombstone, pushed as `delete` + `tombstoneKind`,
and the server (and every device that pulls it) drops all versions below it (`dropPurgedHistory`).

## Key rotation

Key rotation (`useVaultActions().rotateVaultKey`, ADR 0001 D7 amended; owners / managers): a new key at
`keyVersion + 1`, the old one wrapped under it (`vault_key_links` → `MemberVault.previousKeys`, `secretsStore`
loads the whole chain, keys looked up by `vaultKeyId(vaultId, keyVersion)`). Every record version carries the
`keyVersion` it is encrypted with; `vault.rotateKey` is a CAS on `vaults.keyVersion`, after which `record.push`
rejects a put under another key (`key_version`, the client retries it re-encrypted). Before every push
`SyncManager`'s `prepareOutbox` (`reencryptForPush`, `vaults/rekey.ts`) re-encrypts pending versions under an old
key in place, and the rotating device rewrites the live records as new versions (`rekey:` marker in `sync_meta`,
resumable). History keeps the old key. The new key is sealed to every other member and invitee (`memberKeys`; exactly
the server's member set, else `PRECONDITION_FAILED` and the client refetches them once), and the rotator must hold the
current key (`CONFLICT` otherwise). Web: Settings → Vaults (key icon); mobile: `settings/vault` sheet.

## Sharing

Sharing (ADR 0001 D7, `apps/server/src/vault/sharing.ts`, client `vaults/sharing.ts` + `useVaultSharing`; UI: web
Settings → Vaults (`VaultMembersDialog`, `InviteMemberDialog`, `VaultInvitations`, `RevokedVaults`), mobile
`settings/members` page + `member` / `invite` sheets; errors via `sharingErrorMessage`, per-call by tRPC code): `vault.invite` (owners / managers, never above their own role (`canAssignRole`), never the personal vault) stores
a `pending` `vault_members` row with the vault key sealed to the invitee's current public key from the inviter's
(`sealVaultKey`: ephemeral + static X25519, so it opens only as from that sender). The invitee lists
`vault.invitations`, compares the inviter's fingerprint, and `vault.acceptKey` stores their own wrap (row → `active`).
After someone else's rotation a member's row keeps their old wrap plus the sealed new key; `record.sync` returns it in
`keyUpdates` (with the links down to the held key) and `SyncManager`'s `onSharingTasks` (`runSharingTasks`) opens it,
checks the sender (listed active owner / manager with the pinned key, not removed by this device: `markPeerRemoved`)
and that the chain reaches the held key, and accepts it. Removing a member, leaving or declining sets
`vaults.keyRotationNeeded`; `record.sync`'s `rotationsDue` lists it to managers holding the current key, whose next
sync rotates (`removeMember` rotates right away). The last owner can't leave or be demoted (`transferOwnership`).
Peer public keys are pinned per device on first use (`Vault.pinPeerKey`); a changed one is refused
(`PeerKeyChangedError`). A vault lost (or left) with unsent changes keeps their latest versions aside (`revoked_vaults` /
`revoked_records`, `Vault.getRevokedVaults`) to copy into a writable vault (`copyRevokedRecords`, one transaction) or discard.

## Vault UI

Vault UI (`useVaults` / `useVaultActions`, `packages/client/src/hooks/use-vaults.ts`): the decrypted list comes with the
records (`RecordsProvider`), the list filter is `SortedRecordsProvider`'s `vaultFilter` (a search keeps to it; a switch resets the category). Create /
rename / delete: `local` on the device only (`Vault.saveVault` / `setVaultMeta` / `removeVault`), linked on the server
first and only `online` (`VaultsOfflineError`); a create then syncs with `syncManager.syncFresh()` so no older pull drops
it. Web: `features/vaults/` (`VaultSwitcher`: desktop sidebar menu, phone bar pill opening `VaultSheet`; picker in the create sheet,
Settings → Vaults); mobile:
Settings → Vaults + `settings/vault` form sheet, vault submenu in the records header menu.
