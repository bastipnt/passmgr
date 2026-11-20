# Vaults, sync and sharing

Vault model, server access, sync / push, limits and quota, conflict merge, trash, key rotation, sharing and the vault UI.
Sync cursor background: `docs/architecture/sync-cursor.md`.

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
vaults locked first (`lockVaults`, `lock_timeout`, or a new record id a concurrent push took → `SERVICE_UNAVAILABLE`, the client retries), then
compare-and-swap per change on `baseVersion`; each change answers on its own, never as an error for the whole batch:
`applied` (the server holds it, now or from an earlier try), `stale` (the record moved on to `headVersion`: pull, merge,
push again) or `rejected` (it can never apply as sent: `not_found`, `forbidden`, `key_version` (sealed under a key the
vault no longer uses: re-encrypt under the current one and push again) or `quota`). A record's changes in a batch apply
all or nothing (one that can't apply gives all of them its failure), and `clientChangeId` (unique per record) makes a
retry return the stored version (unless another push's purge dropped it meanwhile: the retry is then `stale`; a
retried change below a version the server stored was covered by it and answers with that version). The new versions are
planned in memory and written with one seq bump per vault and one insert, so the vaults stay locked briefly. `SyncManager` sends each record's chain in one batch (`pushBatches`, bounded by `MAX_PUSH_CHANGES` and `MAX_PUSH_BYTES`).
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
`vault.invitations`. A push that waited on a vault's lock while it was deleted answers `not_found`. A chain of deletes may go `DELETE_HEADROOM_BYTES` (10 % of the quota, `record/quota.ts`) past it, since a tombstone carries its content; a chain ending in a purge always applies; a chain of puts rewriting a record still under a rotated-out key is exempt. Every byte a version stores is one its change sent, so a delete can't multiply a record's ciphertext. The ack stores the server's copy; a retry answered with a version stored before a pull moved the chain up moves the record's later pending versions down to the server's numbering (`ackPendingChange`). Writes trigger a debounced sync. A round (`SyncManager`, ADR 0001 D8) pushes the outbox, pulls page by page and, when a change wasn't applied, pushes once more: a `stale` change goes through once the pull has moved it above the server's versions and merged both sides. A push failure every other batch would share (offline, a network failure, an unsigned request while
locked, a rejected session, an unverified email, a busy, throttling or failing server) stops the round (`stopsRound`);
only an answer about the batch itself (a 4xx) is split by record, down to the record whose changes it refuses, and
counted against them. A failed or incomplete round retries with backoff; a rejected change, or one failing `MAX_PUSH_ATTEMPTS` pushes (a `stale` answer never counts: the pull resolves it), is parked (`outbox.parkedAt`, with its record's later changes) until `retryParked`; status via `useSyncStatus`; indicators (web `SyncStatusCard`, `syncCardLines`: desktop sidebar footer, phone `AccountSheet`, plus a dot on the phone's account button; web Settings → Sync & storage; mobile `useSyncHeaderItem`, Settings → Account & sync) read `useSyncSummary` / `summarizeSync` (offline is a state, not an error). `Vault.applySync` drops vaults the user lost (records + cursor) and a changed list reloads the keys into `secretsStore` and the decrypt worker (`SyncManager`'s `onVaultsChanged`).
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
delete, and the local edits stay in the history below the merged version. A field changed on one side only takes that
side's value; changed on both, the side whose last version changing it is later wins (a tie goes to the server's copy).
Tags merge per tag (without case); websites and custom fields have no stable item ids and count as one field each. A
record type changed on either side makes the whole record one field (the later head wins). A tombstone keeps the content
it deleted, so edits made before the delete still merge; the result is deleted only when both heads are tombstones.
`passwordChangedAt` follows whichever password won. Edit times are clamped against clock skew (ADR 0001 D5).
**Pending versions on a pull** (`packages/store/src/schema/outbox-schema.ts`), in one transaction (`Vault.applySync` /
`upsertRecords`), in this order:
1. `dropDeletesOfTombstones`: a pulled tombstone that is the record's newest version (and not below one this device
   has synced) drops a pending chain here that ends in a delete: it wanted the same, and a delete rebased on a `moved`
   tombstone would put the moved record in the trash. A local purge on a tombstone that isn't a purge stays (it still
   drops the history); unsent edits stay and move on top, restoring the record (an edit beats a delete). An older
   tombstone (a full re-pull of a record restored since) leaves a delete made after the restore alone.
2. `rebasePendingVersions`: a pulled row takes its `(recordId, version)` slot, and the record's pending chain moves up
   above the newest pulled version in its order, outbox entries with it, so both edits stay in the history. With
   `applySync`'s resolver (`resolveRecordConflict`) both sides are then merged and the merge is appended as one more
   pending version: the server ends up with its head, the local edits (pushed first, kept as history) and the merge
   on top. A conflict that can't be merged (no base version here, or the resolver throws, e.g. a key that doesn't
   open it) keeps the plain move.
3. The pulled rows are written, then `dropPurgedHistory` drops what is left below a purged tombstone.

## Live updates

`StoreProvider` syncs only while the mode is `online` (not `networkOffline`, see Session modes in `auth.md`): a first
round, polling every 5 minutes, a round on the `online` event and the `record.onRecordChange` SSE stream (a `changed`
event syncs). It starts once the unlock has opened the account's profile, never right after the OPAQUE login: a sync
that lands before would write into another profile. Mobile passes its foreground state as `syncEnabled`: the OS
suspends sockets and timers in the background, so the stream is torn down and rebuilt rather than left to rot. The
server pings the stream every 15 s and the client recreates it after 45 s without one (`apps/server/src/trpc.ts`): a
mobile carrier / NAT drops a silent connection without a FIN and neither side notices. A dropped stream resubscribes
with backoff (5 s doubling to 60 s, reset only by a `changed` event, so a server that accepts then drops never pins a
5 s loop) and syncs on its next `connected`.

## Trash

Trash (`useTrash`, ADR 0001 D5 amended; web Settings → Trash `TrashPage`: Restore per row, delete for good beside it (phone: the row's ⋯ sheet), Empty trash; mobile `settings/trash`): a
tombstone's `tombstoneKind` is null for a delete (in the trash), `moved` for a move's source, `purged` for
a record deleted for good. Restore = update with the tombstone's content (`RecordRepository.restore`).
Purge (`RecordRepository.purge` → `Vault.purgeRecords` → `purgeRecord`) drops every local version + unsent change; a
record the server has leaves a `purged` tombstone, sealed with empty content and pushed as `delete` + `tombstoneKind`,
and the server (and every device that pulls it) drops all versions below it (`dropPurgedHistory`). The tombstone goes on
top of the last synced version; a linked profile's record with only unsent changes gets one on top of the newest of
them, since they may be on their way (a push in flight): the server answers a purge of a record it never got
`not_found`, which the client takes as done. Only a `local` profile's record just goes (it never syncs). A record
already gone or purged (a purge pulled meanwhile) is skipped.

## Key rotation

Key rotation (`useVaultActions().rotateVaultKey`, ADR 0001 D7 amended; owners / managers): a new key at
`keyVersion + 1`, the old one wrapped under it (`vault_key_links` → `MemberVault.previousKeys`, `secretsStore`
loads the whole chain, keys looked up by `vaultKeyId(vaultId, keyVersion)`). Every record version carries the
`keyVersion` it is encrypted with; `vault.rotateKey` is a CAS on `vaults.keyVersion` (it also re-encrypts the vault's metadata and clears
`keyRotationNeeded`), after which `record.push`
rejects a put or a delete under another key (`key_version`, the client retries it re-encrypted). Before every push
`SyncManager`'s `prepareOutbox` (`reencryptForPush`, `vaults/rekey.ts`) re-encrypts pending versions under an old
key in place, and the rotating device rewrites the live records as new versions (`rekey:` marker in `sync_meta`,
resumable). History keeps the old key. The new key is sealed to every other member and invitee (`memberKeys`; exactly
the server's member set, each sealed to their current public key from the rotator's current keypair, else
`PRECONDITION_FAILED` and the client refetches them once), and the rotator must hold the current key, the one the vault
is still at (`CONFLICT` otherwise: another rotation won, or the key isn't accepted yet). Web: Settings → Vaults (a vault's ⋯ menu → Rotate key; on a phone its row's sheet); mobile: `settings/vault` sheet.

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
phone the row opens `SettingsActionsSheet` with all four), then the user's security code to read out); mobile: web's
screens as pages and sheets: `settings/vaults` (every vault and New vault; a shared vault opens its members, the personal
one its form sheet; invitations, changes from lost vaults and the user's security code), `settings/vault` form sheet
(web's `VaultDialog` + `RotateVaultKeyDialog` + `DeleteVaultDialog`: a new vault, or `?vaultId=` rename, icon and colour,
rotate the key, delete after typing its name; both apps' forms run on `useVaultForm` / `useRotateVaultKey` /
`useDeleteVault`, `packages/client/src/hooks/use-vault-settings.ts`, and show actions by `vaultSettingsActions`), `settings/members` page (`VaultMembersDialog`: members with their
security codes; both apps' members screens take who may manage, the last-owner guard and the verify prompt from
`vaultMembersRules` and each row's actions from `memberActions`, `packages/client/src/vaults/vault-settings.ts`;
owners and managers invite and open a member, anyone but the last owner leaves; a local profile is
offered an online account first, offline it waits for the connection), `member` sheet (owners and managers: security
code, role, hand the vault over (owners), remove or withdraw the invite, which rotates the key), `invite` sheet
(`InviteMemberDialog`: look up by email, pick a role, compare the security code before the key is sealed); a vault
submenu in the records header menu.
