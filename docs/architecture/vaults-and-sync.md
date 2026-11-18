# Vaults, sync and sharing

Vault model, server access, sync / push, limits and quota, conflict merge, trash, key rotation, sharing and the vault UI.
Sync cursor background: `docs/sync-cursor.md`.

## Vaults and sync

Every record lives in one vault (`records.vaultId`, local + server) and is encrypted with that vault's key;
the AAD binds `cryptoVersion/stage/vaultId/recordId` (`packages/crypto/src/vault-data.ts`), so a record never
opens in another vault — a move re-encrypts it as a new record and tombstones the source (both
pushed in one batch), whose history stays behind. `cryptoVersion` is the ciphertext format
(`RECORD_CRYPTO_VERSION` 1); the stage isn't stored, it follows from `syncState`
(`secretsStore.recordStageOf`). A version written on the device (`pending`) is a `draft`: only those
identifiers, since its number is provisional and pending versions get renumbered. `SyncManager` seals
each one right before its push (`secretsStore.sealRecord`), binding its `version/keyVersion/state` too,
under the vault's current key; the server stores that `sealed` copy, and every `synced` or pulled row
opens as sealed, so the server can't pass a draft off as one. Drafts never leave the device. A delete carries its own
ciphertext (the head's content; empty for a purge, or for a tombstone whose content doesn't open) and
always appends on the server, even on a tombstone of its kind; a device drops its own pending delete
when a pull brings a tombstone on top (`dropDeletesOfTombstones`, a local purge on a plain one stays), so a
`moved` source never lands in the trash. A live draft that doesn't open is parked; a missing vault key
counts as a failed push (like `key_version`), so it's parked in the end. A tombstone of a synced (sealed)
head re-encrypts its content as a draft under the head's own key (`redraftRecord`), so a delete never
waits for a newer key. On a pull, `Vault.applySync` / `upsertRecords` ignore rows that rewrite a stored
version or don't open as sealed for their slot, key version and state (a purge: empty)
(`withoutForgedRows`, with `SyncManager`'s `RecordSealer.isSealedRow`); a vault with a row under a key
not loaded yet is held back, cursor included, until a later pull: a page stuck on it ends the pull
(no "no progress" error), the round runs the sharing tasks that bring the key and is retried. A push
answer is checked the same way before `ackPendingChange` takes it: the same record and vault, at the
change's version with the ciphertext sent, or (a retry) at or below it holding the same content
(`sameRecordContent`); anything else counts as a failed push. What stays accepted: `docs/security/threat-model-inputs.md`. Vault name/icon/colour are `encryptedMeta` (vault key, AAD `vaultId`).
`personal` = the default vault (one per user, `secretsStore.defaultVaultId`); every other vault is `shared`.
Server access is **membership-based** (`apps/server/src/vault/access.ts`: active `vault_members` row of a
live vault; roles `owner > manage > write > read`), never `records.userId` (that's the version's author).
Unknown and forbidden vaults both answer `NOT_FOUND`; a member with too low a role gets `FORBIDDEN`.
`record.sync` takes one cursor per vault (a vault without one is pulled in full) and returns the full
vault list plus at most `MAX_SYNC_RECORDS` versions (and `SYNC_PAGE_MAX_BYTES`, at least one) in `(vaultId, seq)`
order, one snapshot, `hasMore` when the page is full (`SyncManager` pulls and applies page after page); the cursor is the vault's `records.seq`, taken from `vaults.lastSeq` (`takeVaultSeqs`, row
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
`takeVaultSeqs` / `dropPurgedHistory`) summed over an owner's vaults against `STORAGE_QUOTA_MB`; a chain with a put
past it is `rejected` `quota` (parked, `SyncStatus.storageFull`), and so is a `moved` tombstone in that batch (the move's
other half). `vault.delete` deletes the vault for good (records, history, key links, members, invites: FK
cascades), so its bytes stop counting at once. Counts (`@repo/schema` `vault-schema.ts`): an owner has at most
`MAX_VAULTS_PER_USER` vaults, personal included (`vault.create` locks the user row and refuses with
`PRECONDITION_FAILED`, shown as `TooManyVaultsError`; registration takes at most `MAX_REGISTRATION_VAULTS` = one
less); `vault.invite` refuses (`PRECONDITION_FAILED` `too many invites`) past `MAX_PENDING_INVITES_PER_INVITEE` pending
invites for the invitee, `MAX_PENDING_INVITES_FROM_ONE_SENDER` of them from this inviter (so one account can't fill
someone's list) or `MAX_PENDING_INVITES_PER_SENDER` sent by the inviter (`vault_members.invitedByUserId`, which a
rotation's reseal leaves alone); unlocked counts, so concurrent invites can go a few past. The invitee cap bounds
`vault.invitations`. A push that waited on a vault's lock while it was deleted answers `not_found`. A chain of deletes may go `DELETE_HEADROOM_BYTES` (10 % of the quota, `record/quota.ts`) past it, since a tombstone carries its content; a chain ending in a purge always applies; a chain of puts rewriting a record still under a rotated-out key is exempt. Every byte a version stores is one its change sent, so a delete can't multiply a record's ciphertext. The ack stores the server's copy; a retry answered with a version stored before a pull moved the chain up moves the record's later pending versions down to the server's numbering (`ackPendingChange`). Writes trigger a debounced sync; a failed or incomplete round retries with backoff; a rejected change, or one failing `MAX_PUSH_ATTEMPTS` pushes, is parked (`outbox.parkedAt`, with its record's later changes) until `retryParked`; status via `useSyncStatus`; indicators (web `SyncStatusCard`, `syncCardLines`: desktop sidebar footer, phone `AccountSheet`, plus a dot on the phone's account button; web Settings → Sync & storage; mobile `useSyncHeaderItem`, Settings → Account & sync) read `useSyncSummary` / `summarizeSync` (offline is a state, not an error). `Vault.applySync` drops vaults the user lost (records + cursor) and a changed list reloads the keys into `secretsStore` and the decrypt worker (`SyncManager`'s `onVaultsChanged`).
**Vault list continuity** (`checkVaultList` in `packages/store/src/vault.ts`): the server's list is plaintext and
untrusted, so a pulled page (checked before its keys are loaded, `Vault.checkVaultList`, and again inside
`applySync`'s transaction) and a login's list (`setAccountKeyMaterial`) are refused whole (`VaultListRejectedError`,
`SyncStatus.vaultListRejected`, "Sync stopped") when a vault's `keyVersion` is below the highest this device saw
(`known_vaults`, kept after the vault goes, raised by `saveVault` on a rotation or key update), or the list holds no,
two, or another personal vault than the known one (a relabelled `kind` would make `defaultVaultId` a shared vault).
A page dropping `MASS_VAULT_LOSS` (2) or more vaults at once throws `VaultsMissingError`: nothing is dropped until
the user confirms ("Remove missing vaults", `SyncManager.confirmVaultLoss` → `allowVaultLoss`); a single vault lost is
applied as before (a server dropping one per pull is indistinguishable from removals; unsent changes stay for rescue).
A login's list never drops a cached vault (only a sync does, behind that check); a rekey saves keep the stored list
(`saveAccount(…, null)`). `onVaultsChanged` throws when the keys don't load (no single personal vault, its wrap doesn't
open), so that page isn't stored either; keys loaded for a page that then fails are swapped back for the stored
list's. A refusal caused by this device moving a vault on during the pull (its own rotation) reruns the round quietly.
A pull that collides with pending local versions merges field by field (ADR 0001 D5, `mergeRecord` /
`resolveRecordConflict`): the later `clientUpdatedAt` wins a field changed on both sides, an edit beats a
delete, and the local edits stay in the history below the merged version.

## Trash

Trash (`useTrash`, ADR 0001 D5 amended; web Settings → Trash `TrashPage`: Restore per row, delete for good beside it (phone: the row's ⋯ sheet), Empty trash; mobile `settings/trash`): a
tombstone's `tombstoneKind` is null for a delete (in the trash), `moved` for a move's source, `purged` for
a record deleted for good. Restore = update with the tombstone's content (`RecordRepository.restore`).
Purge (`RecordRepository.purge` → `Vault.purgeRecords`) drops every local version + unsent change; a
record the server has leaves a `purged` tombstone, sealed with empty content and pushed as `delete` + `tombstoneKind`,
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
current key (`CONFLICT` otherwise). Web: Settings → Vaults (a vault's ⋯ menu → Rotate key; on a phone its row's sheet); mobile: `settings/vault` sheet.

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
sync rotates (`removeMember` rotates right away; the personal vault is never rotated for `rotationsDue` and its key is
never sealed to anyone, `secretsStore.rotateVaultKey` refuses). The last owner can't leave or be demoted (`transferOwnership`). `vaults.ownerId` (whose quota and vault count the vault takes) always names an active owner: when that owner leaves, is removed or is demoted, it moves to the longest-standing remaining owner (`keepOwnerIdActive`, past their quota if need be); `transferOwnership` refuses (`PRECONDITION_FAILED`) when the vault would take the new owner past `MAX_VAULTS_PER_USER` or their storage quota. `deleteAccount` moves it the same way, and a migration fixed the rows that had drifted. Member and key changes read the caller's role again after taking the vault lock (`lockVaultForRole`; the first read keeps outsiders from holding the lock), so a concurrent demotion, removal or promotion counts.
Peer public keys are pinned per device only on an explicit check: the invitee's on invite, the inviter's on accept,
anyone else's when the user marks them verified after comparing codes (`verifyMember`; members list: "Not verified" +
"Verify…", which asks to compare the code first; mobile's row does it for non-managers, its member sheet for managers;
managers see `UNVERIFIED_MEMBERS_NOTICE`). A rotation seals only to pinned keys: any unpinned member aborts it
(`UnverifiedMembersError`, shown to the user; `removeMember` resolves it after the removal went through, a `rotationsDue`
rotation only logs it) and a key update is only taken from a pinned sender. A rotation that isn't done shows as
"rotation pending" (`SyncStatus.rotationsPending`, `useRotationPending(vaultId)`, `ROTATION_PENDING_NOTICE` in the
members dialog / page): a `rotationsDue` vault whose rotation failed here (`runSharingTasks` resolves them; a lost
connection counts all as pending), or one this device rotated whose records aren't all re-encrypted yet
(`reencryptForPush` resolves the open rekey targets). Set by every round that goes through. A changed key is refused (`PeerKeyChangedError`). A vault lost (or left) with unsent changes keeps their latest versions aside (`revoked_vaults` /
`revoked_records`, `Vault.getRevokedVaults`) to copy into a writable vault (`copyRevokedRecords`, one transaction) or discard.

## Vault UI

Vault UI (`useVaults` / `useVaultActions`, `packages/client/src/hooks/use-vaults.ts`): the decrypted list comes with the
records (`RecordsProvider`), the list filter is `SortedRecordsProvider`'s `vaultFilter` (a search keeps to it; a switch resets the category). Create /
rename / delete: `local` on the device only (`Vault.saveVault` / `setVaultMeta` / `removeVault`), linked on the server
first and only `online` (`VaultsOfflineError`); a create then syncs with `syncManager.syncFresh()` so no older pull drops
it. Web: `features/vaults/` (`VaultSwitcher`: desktop sidebar menu, phone bar pill opening `VaultSheet`; picker in the create sheet,
Settings → Vaults: "New vault", one row per vault with Members (shared) and a ⋯ menu (Edit, Rotate key, Delete; on a
phone the row opens `SettingsActionsSheet` with all four), then the user's security code to read out); mobile:
Settings → Vaults + `settings/vault` form sheet, vault submenu in the records header menu.
