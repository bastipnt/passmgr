# ADR 0001 — Offline-first, local vaults, multiple vaults and record types

- **Status:** Accepted
- **Date:** 2026-10-01
- **Tracking:** kanbot board "TODO", label `offline-first` / `multi-vault`

## Context

Today the server is the source of truth:

- Writes are server-first. `use-create-record` / `use-update-record` / `use-delete-record` call
  tRPC and only `upsertRecords` the server's answer into the local SQLite cache.
- `SyncManager` only pulls (`record.sync`, cursor = `updated_at`) and swallows errors.
- Offline unlock exists, but only after one online login: the wrapped vault key and the
  account email are cached in `key_material`. `storeKeyMaterial` wipes the local vault when a
  different email logs in.
- `record.update` answers a version mismatch with a hard `CONFLICT`.
- One symmetric `vaultKey` per user encrypts every record. The password KEK and the recovery KEK
  each wrap it (`generateUserKeys`, `packages/crypto/src/user-keys.ts`).
- The decrypted payload is `{ schemaVersion: 1 } & LoginRecord`, so login records only.
- The local schema has no migrations (`CREATE TABLE IF NOT EXISTS` in `Vault.init()`).

What we want:

1. The app works **without ever contacting a server**. Create, update, delete and history all
   run locally.
2. A user can **create an online account later** from their local data, with the same master
   password, and without re-encrypting anything.
3. **Multiple vaults** (personal, work, …) and **vaults shared with other accounts**.
4. **Multiple record types** (login, credit card, identity, secure note, SSH key, …).

Points 3 and 4 get their UI later. The data model and key hierarchy must already support them
**before** local-only vaults ship: a local-only vault has no server that could migrate it, so
every later format change becomes a client-side migration on every device.

**The project is still a work in progress with no real users.** This ADR therefore makes clean
breaks: no migration of existing accounts, local databases or payloads, and no compatibility
period for old endpoints. Dev databases (server and local) are reset when the new schema lands,
and the Drizzle migrations may be squashed into a new baseline. The local migration runner is
still built, for changes **after** the first release.

## Decisions

### D1 — The local database is the source of truth

The SQLite vault (`packages/store`) is the system of record on every device. All reads and
writes go to it. The server is an optional **sync relay and backup**. No UI path waits for the
server, apart from account operations that genuinely need it (registration, login, sharing).

### D2 — Device profile, session modes, logout semantics

- One **profile** per device = one user. It has a client-generated `profileId`, an optional
  `email`, and a `mode`:
  - `local`: no account exists
  - `linked`: an account exists; we store the `userId` here
- The **session state** is separate from the profile:
  - `local`: unlocked, no account
  - `online`: unlocked, the server session is live
  - `offline`: unlocked, has an account, no connection or the session expired
- **Unlocking** (getting the account key into memory) never needs the server. **Server auth**
  (OPAQUE session → `authKey` for the HMAC headers) is attached or detached independently.
  Losing it moves the session from `online` to `offline`. It does not lock the vault or force a
  login.
- Mobile fast-unlock (`use-session-restore`) restores the vault keys without the heartbeat. A
  failed heartbeat only changes `online` → `offline`.
- Three distinct actions:
  - **Lock**: wipe the keys from memory.
  - **Sign out** (linked only): end the server session, keep the local data.
  - **Remove from this device**: delete the local database. Needs an explicit confirmation, and
    for `local` mode a warning that this deletes the only copy.

  Logout never wipes a local-only vault.
- ~~Multiple profiles per device are out of scope.~~ Superseded by the 2026-10-07 amendment
  below: a device holds any number of profiles. Signing into an existing account on a device
  that has an unlinked local profile is handled in D9.

> **Amended 2026-10-03** (session modes implementation): the profile is the local `profile` table
> (`LocalProfile`, at most one row, written atomically with the key material); the email moved
> there from `key_material`, and `finishLogin` returns the `userId` so "same account" means same
> `userId`, not same email. `SessionProvider` exposes `vaultUnlocked`, `mode` (derived from the
> profile mode and whether server auth is attached) and `networkOffline`; the old `sessionId ===
> "offline"` marker is gone. A device's vault unlocks by password alone (`unlockLocal`); a linked
> one then attaches server auth in the background (`useConnectServer`, single-flight), and falls
> back to the server login when the local wrap doesn't open (password changed elsewhere). An online
> login never replaces a `local` profile: it fails with `local_vault` until D9's merge/replace
> exists. `UNAUTHORIZED` from sync or the mobile restore heartbeat only detaches the server
> (`online` → `offline`); without a password in memory (restored mobile session) the user signs in
> again from settings. The mobile bundle persists the server session only optionally
> (`LoginBundle.server`). Until the local-first repository lands, record writes still need
> `online` (`useCanWrite`). Actions: `useLock`, `useSignOut` (server logout + lock + drop the
> persisted mobile login, local data kept), `useRemoveFromDevice`.
>
> **Amended 2026-10-05** (local vault creation): `generateKeyring` (`packages/client/src/account/new-keyring.ts`)
> builds the same keyring for registration and for a local vault, so linking (D9) reuses it as is.
> `useCreateLocalVault` stores it with `Vault.createLocalVault` in one transaction: the `local`
> profile, the password wrap + keypair (`AccountKeyMaterial`) and the recovery wrap + verifier
> (`RecoveryKeySchema`, kept only for local profiles: for D9's upload and D10's local recovery). It
> refuses (`VaultExistsError`) when the device holds any trace of a vault (raw profile, account key,
> vault or record rows). The vault unlocks only after the
> recovery key is confirmed, with the account key kept from creation (no second Argon2). A `local`
> profile's unlock is password-only (no email field, no server fallback) and rekeys stale Argon2
> params on the device (`rekeyLocalIfParamsStale`; every rekey derives in the Argon2 worker). `useAppConfig` retries once, then reads as "no
> registration"; the local vault route (`/local-vault` on web, "Start without an account" on mobile)
> never depends on it. No display name on the profile yet.
>
> **Amended 2026-10-07** (multiple profiles per device): a device holds any number of profiles side
> by side — local vaults and linked accounts — each with its own data, keys, outbox and sync state.
>
> - **Storage: one SQLite database per profile** (`pass-mgr-<profileId>`, `.sqlite3` in OPFS on web,
>   `.db` on mobile), each with today's schema (`Vault`, its `profile` row stays the source of truth,
>   written atomically with the key material). A small device-level **registry** database
>   (`pass-mgr-profiles`, own drizzle schema `registry-tables.ts` + migrations in `drizzle-registry/`)
>   lists them: `profileId`, `mode`, `email`, `userId` (unique), optional display `name`,
>   `databaseName`, `createdAt`, `lastUsedAt`. It holds no key material. `ProfileStore`
>   (`packages/store/src/profiles.ts`) owns both: `create` fills a new database first and lists it
>   only once that worked (a failed fill deletes the file), `remove` deletes the file (via
>   `SqlDriver.deleteDatabase`) before the row, so a crash can leave an unlisted file but never a
>   listed profile without data. Not a `profileId` column per table: isolation by construction,
>   removal = deleting a file.
> - **Per-profile state:** the mobile login bundle (Keychain/Keystore item
>   `passmgr.login-bundle.<profileId>`), biometric enrollment (web: in the profile's database
>   already; mobile: the login bundle), the Argon2 rekey state (in the wrap), and the
>   "biometric dismissed" preference (`biometric-dismissed:<profileId>`). Other preferences
>   (auto-lock, theme, generator) stay device-wide.
> - **App wiring:** `StoreProvider` takes the `ProfileStore`, lists the profiles and opens the last
>   used one on launch (`loaded`, `profiles`, `active`). Only one profile is open and unlocked at a
>   time: `selectProfile` refuses while unlocked (lock first), disposes the previous profile's
>   `SyncManager` (sync + SSE stop; `dispose` waits for a running round), closes its database and
>   opens the next one. Opening, adding and removing profiles run one at a time (a lock in
>   `StoreProvider`). `vault`,
>   `syncManager` and `records` are `null` without an active profile. Async flows read
>   `store.current()` (not a render's snapshot), and `saveAccount` names its target profile, so a
>   background rekey never lands in a profile opened meanwhile. Mobile fast-unlock restores the
>   last used profile only.
> - **Login semantics:** the unlock screen shows the last used profile's unlock card; "Switch"
>   shows the email login with every profile listed (pick one → its unlock). Signing in with the
>   email of a profile on the device unlocks that profile exactly like picking it
>   (`useUnlock().unlockByEmail` → `unlockLocal`: no download, no wipe; offline too). Any other
>   email logs in to the server, and `openAccountProfile` opens the profile of that `userId` or
>   adds one. `adoptAccount`'s clearing is gone, and so are the `local_vault`, `unsynced_changes`
>   and `account_changed` refusals: an email that now belongs to another `userId` gets a new
>   profile, the old one stays. Offline, an email without a profile fails with `wrong_account`.
> - **Remove one / all:** `useRemoveFromDevice` (`removeFromDevice(profileId?)`, `removeAll`) or,
>   on the locked screens, `store.removeProfile` / `removeAllProfiles`: the database, the persisted
>   login, the per-profile preference. The warnings stay: a `local` profile is the only copy; a
>   linked one names its unsynced changes (`countPendingChanges(profileId)` opens a closed profile
>   briefly). Removing the active profile opens the next most recently used one.
> - **Local vaults** get an optional name (`useCreateLocalVault().createLocalVault(password,
>   name)`); creating one on a device that already holds profiles adds another profile
>   (`vault_exists` is gone; `VaultExistsError` still guards a new database).
> - **Migration:** none (no users yet): sign in again. The single pre-profile database
>   (`pass-mgr.sqlite3` / `pass-mgr.db`) is deleted once by `ProfileStore` (marked in the
>   registry's `registry_meta`), so no vault or email lingers where no "remove" reaches.
> - Not covered: tabs see the registry as of their own load (a profile added in another tab shows
>   after a reload); renaming a profile has no UI yet (`ProfileStore.rename` exists).

### D3 — Key hierarchy v2: account key wrapping per-vault keys

```
password ──Argon2id──► passwordKEK ──wrap──► accountKey
recoveryKey ──HKDF──► recoveryKEK ──wrap──► accountKey            (backup)
recoveryKey ──HKDF──► recoveryAuthKey ──SHA-256──► recoveryVerifier (server, unchanged)

accountKey ──wrap──► vaultKey[v]          for every vault the user owns or has accepted
accountKey ──wrap──► x25519PrivateKey     (sharing, D7)
memberPublicKey ──seal──► vaultKey[shared] per member, until they accept (D7)

vaultKey[v] ──XChaCha20-Poly1305──► records of vault v, vault metadata of v
```

- A new random 32-byte **`accountKey`** sits between the KEKs and the data keys.
- Each vault has its own random `vaultKey`. The default "Personal" vault is created together
  with the account key, in the place of today's single `vaultKey`.
- Password change, Argon2 rekey and recovery only rewrap the `accountKey`. Vault keys and
  records stay untouched.
- `secretsStore` holds `accountKey`, a map `vaultId → vaultKey` and the X25519 private key, and
  wipes all of them on `lock()`. The decrypt worker receives the per-vault key map.
- Biometric enrollment and the mobile login bundle store the **`accountKey`** instead of the
  vault key.
- Key sets stay versioned (`valid_from` / `valid_to`, never `UPDATE`). The server's `keys`
  table stores the `accountKey` wraps (replacing the `encryptedVaultKey*` columns); vault keys
  go into `vault_members` (D6).
- No migration: `generateUserKeys` produces the v2 keyring directly, and existing dev accounts
  are reset.

Rejected alternative: use one key as both account key and Personal vault key. It saves a key
level, but then a password change or recovery is bound to the data key, and the Personal vault
can't be shared or rotated like any other vault.

### D4 — Record payload: typed, versioned, inside the ciphertext

- The decrypted payload is a discriminated union on **`type`**: `login | card | identity |
  note | ssh_key | api_key | wifi` (extensible; `passkey` comes with the extension work).
- Shared base fields: `title`, `note`, `favorite`, `tags`, `customFields`, an `attachments`
  placeholder. Type-specific fields sit next to them.
- `type` and every other field live **inside the ciphertext**. The server never learns record
  types; the server row stays `{ recordId, vaultId, encryptedData, nonce, cryptoVersion,
  version, … }`.
- `schemaVersion` describes the payload. The typed format **is** version 1; the current
  `LoginRecord` becomes `{ type: "login", … }` and the unused `category` is dropped, without an
  upgrade path for existing payloads. Later upgrades are **client-side and lazy**: on decrypt
  the payload is upgraded in memory, and it is written back in the new format on the next edit.
- Field specs, diff and version-change helpers (`login-field-specs.ts`, `diff-fields.ts`,
  `version-changes.ts`) become per-type, so history works for every type.

> **Amended 2026-10-03** (typed payload implementation): schemas in
> `packages/schema/src/record-types.ts` (`recordDataSchema`, `RecordData`; `RecordPayload` adds
> `schemaVersion`). The old `extraFields` are the base `customFields`; `attachments` is an
> always-empty placeholder. `upgradeRecordPayload` runs on every decrypt (client side, the
> decrypt worker returns raw JSON) and **rejects** an unknown `schemaVersion` rather than showing a
> newer client's payload half-understood, where an edit would drop its unknown fields, and an
> unknown `type` (any writing vault member can author payloads); rejected records are skipped like
> undecryptable ones, in the list and in history.
> `encryptRecord` always stamps the current version. Field specs are `getRecordFieldSpecs`
> (`packages/client/src/records/record-field-specs.ts`): one table of fields per type, groups
> `title | fields | websites | note | custom`, kinds generic (`text`, `secret`) next to the login
> ones. Lists and search use `getRecordSubtitle` / `getRecordWebsites`. The forms are still
> login-only (`loginFormSchema`, `loginRecordFromForm` keeps favourite/tags/attachments on edit);
> `hasEditForm` hides Edit for other types, and `loginRecordFromForm` refuses them.

### D5 — Record versioning and conflict resolution

**Versions.**

- A record is an append-only chain `(recordId, version)`. The highest version is the current
  state; a tombstone version marks it deleted.
- **The server assigns canonical version numbers.**
- Locally a pending edit is stored as `version = baseVersion + 1`, `syncState = pending`. It
  gets renumbered once the server acknowledges it.
- Several offline edits of one record are pushed in order as a chain, so the history keeps
  them.

**Push is compare-and-swap.**

- Each change carries `baseVersion`. If `baseVersion == head`, the server appends and returns
  the new version.
- Otherwise it returns **`stale` for that change**, together with the current head. This is not
  an error, and the other changes in the batch still apply.

**Merging happens on the client.** The server can't read the data, so it can't merge. On
`stale`, the sync engine runs a **three-way, field-level merge**: base (local copy of
`baseVersion`) × local × server head.

- Fields changed on one side only: take that side.
- Same field changed on both sides: the change with the later `clientUpdatedAt` wins.
- **The losing edit is kept as a history version, so nothing is lost.** The client pushes it
  first, then the merged result, in one atomic request with `baseVersion = head`.
- **Edit vs. delete: the edit wins**, so the record is restored. In a password manager a lost
  edit is worse than a record that comes back.

**Idempotency.** Every pushed version carries a client-generated `clientChangeId`, unique per
record on the server. A retry after a lost response returns the existing version instead of
appending a duplicate.

Rejected alternatives:

- Plain server-side last-write-wins on arrival order: a device that syncs days later silently
  overwrites newer edits.
- Always creating a "conflict copy": noisy, and the user has to clean up duplicate records.

### D6 — Vaults in the data model

**Local** (part of schema v2):

- `vaults`: `vaultId`, `kind` (`personal` | `shared`), `role`, the wrapped vault key + key
  version, and encrypted metadata (name, icon, colour, encrypted with the vault key).
- `records.vaultId` is NOT NULL. The repository API is vault-scoped; "All vaults" is a union
  view.

**Server:**

- `vaults (vaultId, ownerId, kind, encryptedMeta, keyVersion, timestamps)`
- `vault_members (vaultId, userId, role, wrappedVaultKey, keyVersion, status)`
- `records.vaultId` (FK); `records.userId` is kept as the author.
- Access is checked through **vault membership**, not through `records.userId`.
- Roles: `owner`, `manage` (invite/remove), `write`, `read`. The server enforces them per change
  on push, on membership changes and on metadata updates. Every vault has at least one owner.

**Ids** for vaults, records and changes are client-generated UUIDs, so they can be created
offline.

**Moving a record to another vault:** decrypt, re-encrypt with the target vault key, write a new
record in the target that references the old `recordId` in its payload, and tombstone the
source. History stays with the source record. The two vaults may have different members, and
the history must not leak into the target.

**Existing data:** none to migrate. The new tables are part of the reset baseline.

> **Amended 2026-10-02** (vault data model implementation): every vault other than the default one
> has `kind = shared`, whether or not it has other members yet. `vault_members.status` is `active` or
> `pending`; only `active` grants access. Until `record.push` lands, a move is its own `record.move`
> mutation (one transaction: new record in the target, tombstone in the source); the moved payload
> doesn't reference the old `recordId` yet, that comes with the typed payload (D4). `record.sync` takes
> one cursor per vault and returns the full vault list; the cursor is still `updated_at` until the
> sequence cursor (D8).

### D7 — Sharing (design now, build after offline-first)

- Every user has an **X25519 keypair**, generated at local vault creation or at registration,
  so local-only users already have one when they link an account. The private key is wrapped by
  `accountKey`. The public key is uploaded on registration or linking.
- **Invite:**
  1. The owner fetches the invitee's public key from the server.
  2. The app shows the key's **fingerprint** (a short verification code) for out-of-band
     comparison. A malicious server could otherwise substitute its own key.
  3. The owner seals the vault key to that public key (ephemeral X25519 + HKDF + XChaCha20, in
     the style of `crypto_box_seal`), which creates a `vault_members` row with
     `status = pending`.
  4. When the invitee accepts, the vault key is re-wrapped under their own `accountKey`.
- **Removing a member** (or a member leaving) **rotates the vault key**: a new `keyVersion`, all
  records re-encrypted client-side through the outbox, the new key sealed to the remaining
  members. Without rotation the removed member could still decrypt future changes.
- **Access revoked while offline:** the server rejects pending outbox changes for that vault per
  change. The client shows them and offers "copy to my Personal vault".
- Sharing a single record is modelled as a two-member shared vault. A per-record key comes
  later if needed. Organisations reuse the same model.
- Sharing requires a linked account. In `local` mode the share action leads to "Create online
  account".

> **Amended 2026-10-02** (keypair implementation): the keypair comes from its own
> `createUserKeyPair(accountKey)`, next to `createVault`, not from `generateUserKeys`: recovery
> calls `generateUserKeys` with the existing account key and must keep the published public key.
> Server table `user_key_pairs (userId, keyVersion, publicKey, encryptedPrivateKey, nonce)`,
> append-only, highest `keyVersion` is current; `user.publicKey` looks one up by email. The wrapped
> keypair is cached locally with the account key material. Every unlock (password, biometric,
> restore) loads it into `secretsStore` next to the vault keys and fails if the private key doesn't
> match the public key, so a server can't make the app show (and the user confirm) a fingerprint
> for a key the user doesn't hold.
>
> Open for the invite work: the seal is anonymous, so anyone (including the server) can seal a
> vault key to a user and forge an invite to a vault whose key it knows. Invites need sender
> authentication (e.g. the owner signs or authenticates the sealed key with a static key whose
> fingerprint the invitee checks) before accepting.

### D8 — Sync protocol

- **Outbox** (local table): every write is a single SQLite transaction that writes the record
  version and enqueues the change.
- **Sync cycle** (linked mode only):
  1. Push the outbox in batches (`record.push`).
  2. Apply the results: acknowledged → renumber and mark `synced`; `stale` → merge (D5) and
     re-push; `rejected` → surface in the UI.
  3. Pull.
- **Pull cursor:** a monotonic server sequence (`bigserial` on `records`), stored **per vault**.
  The `updated_at` timestamp cursor goes away: it can miss rows from concurrent transactions.
  Pull is paginated.
- **Triggers:** after a local write (debounced), the SSE `onRecordChange` event, reconnect, app
  foreground, and a polling interval. Retries use exponential backoff. A change that keeps
  failing is parked and shown in the UI instead of retried forever.
- **Sync status** exposed to the UI: `idle | syncing | pending(n) | error | offline`.
- Request auth is unchanged (HMAC-signed headers, D2 attaches them). `record.push` **replaces**
  `record.create`, `update` and `delete`, which are removed in the same change. `record.all` and
  `getById` are removed too, because clients read locally.

> **Amended 2026-10-05** (local-first repository + outbox): `RecordRepository`
> (`packages/client/src/records/record-repository.ts`) is the only record write path; it encrypts and
> calls `Vault.writeLocalChanges`, which writes each change as the record's next version
> (`syncState = pending`, version = local head + 1, computed inside the transaction) plus an `outbox`
> row (`changeId`, write order `seq`), atomically; a move is a create + a delete in one transaction. An
> update appends whatever the head is, a tombstone included (edit restores). History and every read
> are local; nothing gates writes on the session mode anymore (`useCanWrite` is gone; role-based
> gating comes with the sharing UI). `SyncManager` pushes the outbox oldest first, then pulls; a failed
> change holds back its record's later changes and is retried once after the pull. A pull that brings
> versions colliding with pending ones moves the pending chain above them (`rebasePendingVersions`):
> both edits stay in the history, no field merge yet (D5 lands with the conflict strategy). Until
> `record.push` exists, `StoreProvider` pushes through `record.create` / `update` (base = version − 1)
> / `delete` (NOT_FOUND counts as done), so there is no idempotency yet: a lost response can leave a
> duplicate version. `record.update` now appends to a tombstoned head too (edit restores, D5).
> Offline, network failures and a rejected session stop the push round without counting against
> the change; a change the server stored is never counted failed, even when its local ack fails.
> Outbox entries of a vault the user lost are dropped with its records. Pending changes are the only
> copy until pushed, so the device is never wiped while it holds them: a login to another account
> fails with `unsynced_changes`, recovery keeps the vault (dropping only biometric + persisted
> login), and "Remove from this device" names how many changes would be lost.

> **Amended 2026-10-06** (field-level merge, D5): a pull that collides with pending versions still
> moves the pending chain above the server's (kept as history, pushed first), then
> `resolveRecordConflict` (`packages/client/src/records/`) decrypts base (the synced version below the
> chain) × local chain × server versions, merges with `mergeRecord` and appends the merge as one more
> pending version; nothing is appended when the local head already is the merge. Fields are the
> payload keys (not `getRecordFieldSpecs`, which hides favourite/tags); `tags` merge per tag,
> `websites`/`customFields` count as one field each (no stable item ids); a changed `type` makes the
> whole record one field. A field's time is the last version on its side that changed it; a tie goes
> to the server. Clock skew: a local edit is clamped to the pull's `serverTimestamp`, a server version
> to its `created_at`; a clock running behind can still lose a field it should win. A conflict that
> can't be merged (base missing, a version that doesn't open) keeps the plain move. The resolver runs
> inside `applySync`'s transaction, passed in by `SyncManager` (`resolveConflict`). `record.delete`
> takes an optional base `version` (CONFLICT when stale), so a local delete no longer lands over an
> edit it never saw; the interim push sends it.

> **Amended 2026-10-06** (sequence cursor): the sequence is per vault, not one `bigserial`. A global
> sequence still skips rows: a value is taken at insert but becomes visible at commit, so seq 6 can
> commit (and be pulled) before seq 5. Each write instead bumps `vaults.lastSeq` in its transaction
> (`nextVaultSeqs`, `apps/server/src/vault/access.ts`) and stores it as `records.seq` (unique per
> vault). The bump row-locks the vault until commit, so a vault's writes commit in `seq` order and a
> pull that sees seq N sees everything below it; a move locks both vaults in id order (no deadlock).
> Writes to one vault are serialised, which is fine at password-manager write rates. `record.sync`
> takes `cursors: vaultId → seq` and returns the next `cursors` (highest seq pulled per vault);
> `serverTimestamp` stays only as the clock cap for the merge. The device stores them as
> `pullSeq:<vaultId>` in `sync_meta`; the old `lastSyncedAt:` rows are ignored (one full pull).
> Walkthrough: [`docs/sync-cursor.md`](../sync-cursor.md).

> **Amended 2026-10-06** (`record.push`): `record.push({ changes })` replaces `create`, `update`,
> `delete`, `move`, `all` and `getById` (`history` stays). A change is `op: "put" | "delete"` with
> `clientChangeId` (the outbox `changeId`), `recordId`, `vaultId`, `baseVersion` (the version below
> the pending one; 0 for a new record) and `clientUpdatedAt`; a put carries the ciphertext, a delete
> doesn't (the tombstone keeps the server head's). The server (`apps/server/src/record/push.ts`) runs
> the batch in one transaction: write access per vault (a missing or foreign vault is `not_found`, a
> read member `forbidden`), then `lockVaults` in id order, then per record: decide every change
> against the head the ones before it leave, and write the record's new versions only if all of them
> apply; otherwise they all get the first failure (`stale` with the server's `headVersion`, or
> `rejected`). A change the record already has by `clientChangeId` answers `applied` with the stored
> version (never one from another vault). Every applied change appends exactly one version, a delete
> of a deleted head too (one more tombstone), so the server numbers a chain the way the client did
> and a chain can go on after it; the versions are planned in memory and written with one
> `takeVaultSeqs` bump per vault and one insert, keeping the lock short. Duplicate `clientChangeId`s
> in a batch are a `BAD_REQUEST`. A put of base
> 0 for an id that exists answers `stale`, or `rejected` when the id lives in another vault; a version
> of a record the server doesn't have is `rejected`. `lock_timeout = 5s`; a lock wait past it, or a
> new id racing into the same id in another vault (unique violation), fails the whole batch with
> `SERVICE_UNAVAILABLE`, which `StoreProvider` treats like a network error (`stopsRound`). Batches hold
> at most `MAX_PUSH_CHANGES` (500); `SyncManager.pushBatches` keeps each record's chain in one batch
> (only a longer chain is split), so a losing edit and its merge reach the server together or not at
> all. One `notifyVaultMembers` per batch pings each member once. Records carry `clientChangeId`
> (NOT NULL, unique per record), part of the reset baseline. A move is pushed as the target's put and
> the source's delete; they share a transaction only when they land in the same batch.
>
> **Amended 2026-10-07** (two-way sync engine): `RecordRepository` writes call
> `SyncManager.requestSync`, debounced 750 ms. SSE `changed`, the SSE stream coming back after a drop
> (its `connected` event), the browser `online` event, app foreground (mobile re-enables sync) and a
> 5-minute interval call `sync()`. A round that fails, or leaves changes queued, is retried while
> enabled with backoff 5 s · 2ⁿ up to 5 min, reset by a round that pushes everything. A change is
> **parked** (`outbox.parkedAt`) when the server rejects it (`not_found` / `forbidden`, a retry can't
> help) or after `MAX_PUSH_ATTEMPTS` (8) failed pushes; a `stale` answer keeps its reason but isn't
> counted (the pull resolves it). A parked change and its record's later
> changes stay local and pending (they still count as unsynced) until `SyncManager.retryParked`
> (`Vault.retryParkedChanges` resets `attempts`), so they never hold up other records. A batch the
> server refuses as a whole (a 4xx such as `BAD_REQUEST`) is split in halves by record chain until
> the refused chain is alone; only that chain counts the failure, and the rest of a chain too long
> for one batch isn't sent that round. 5xx, 429, 503 and 401 answers stop the round (`stopsRound`)
> instead, so an outage never counts against a change. `Vault.getParkedChanges` lists them for the UI.
> `SyncManager.getStatus()` / `onStatusChange` (`useSyncStatus`) expose `phase`
> (`idle | syncing | error | offline`; `offline` = disabled, or a round that didn't reach the
> server, `isOffline`), `pending`, `parked`, `error` and `lastSyncedAt`; "pending(n)" is `idle`
> with `pending > 0`. Sync is only enabled in `online` mode, so a `local` profile reads `offline`
> and the UI shows no sync status for it. Discarding a parked change, or copying it to another
> vault (D7), is left to the sync status UI.

### D9 — Creating an account from a local vault ("linking")

1. Enter an email (and an invite code if `REGISTRATION_DISABLED`), then re-enter the master
   password. It is verified locally by unwrapping `accountKey`.
2. OPAQUE `registerInit` / `registerFinish` as in `register.ts`.
3. `finishRegistration` (or a new `linkVault`) receives the **existing** keyring:
   - the password wrap and recovery wrap of `accountKey`
   - `recoveryVerifier`
   - the public key and the wrapped private key
   - every vault, with its wrapped key and encrypted metadata

   **No new keys are generated.** The user's recovery key stays valid.
4. Log in, then upload all vaults and records with their full history through `record.push`, in
   batches. If the upload is interrupted, it resumes on the next sync.
5. The profile switches to `mode = linked` and stores `userId` and `email`.

**Signing into an existing account on a device with an unlinked local profile:** since
the multiple-profiles amendment (D2, 2026-10-07) the default is a **separate profile**: the
account gets its own, the local one stays as it is. Merging stays an option the user chooses:

- **Merge:** the local vault keys are re-wrapped under the account's `accountKey` and uploaded
  as additional vaults. Records are not re-encrypted.
- **Replace:** delete the local data, after an explicit confirmation and an export prompt.

There is never a silent wipe.

> **Amended 2026-10-08** (linking implementation): `finishRegistration` takes the keyring as it is
> plus an optional `vaults` list (the local vault's other vaults, created `shared` + owner, at most
> `MAX_REGISTRATION_VAULTS`); no separate `linkVault`. `useLinkAccount` (web: "Create online
> account" in the account settings of a `local` profile; mobile UI comes with the offline-first UI
> ticket) checks the password against the stored wrap, builds the keyring from the stored password
> wrap, recovery wrap + verifier, keypair and vaults (`localVaultKeyring`), then
> `registerLocalVault`: `registerAccount` (the OPAQUE half of `registerNewUser`) and a login whose
> session is held back. The login decides, not the registration: the server answers a taken email
> like a new one, and on a retry the invite is already spent, so a registration error only counts
> when the login fails too. The account must hold this vault's public key, otherwise the email
> belongs to another account (`rejected`). Then `saveAccount` turns the profile `linked` (registry
> too) and drops the local recovery wrap in the same transaction, and `SessionContext.linkServer`
> attaches the session and switches the mode `local` → `online`, in that order: going online
> starts the sync. **The upload is the outbox:** every local write already has an outbox entry, so
> the first sync pushes every record with its full history in `record.push` batches, and an
> interrupted upload simply continues with the next sync. A failure before the profile is linked
> leaves the device untouched; linking again finishes it (same account). Merge / replace when
> signing into an existing account stays open (separate profile is the default).

### D10 — Account operations without a server

- **Local mode:** password change (rewrap `accountKey`), Argon2 rekey, recovery with the
  recovery key (unwrap `accountKey`, set a new password, issue a new recovery key) and biometric
  enrollment all run fully on the device.
- **Linked mode:** password change and recovery need the server: a new OPAQUE registration
  record, a new key set and `freshAuthProcedure`. They are **blocked while offline**, otherwise
  the local and server key sets would diverge. An Argon2 rekey is also deferred until online.

> **Amended 2026-10-08** (implementation): `useChangePassword` is one hook for both modes. Local:
> the current password is checked against the stored wrap, the account key is rewrapped on the
> device (`changeLocalPassword`). Linked, online only (`blocked` otherwise): a fresh OPAQUE login
> with the current password, then `user.startPasswordChange` / `finishPasswordChange` (new OPAQUE
> record + new key set with the recovery wrap carried over, every session revoked), then a login
> with the new password. Local recovery (`recoverLocal`) unwraps the account key with the stored
> recovery wrap and replaces both wraps in one transaction (`Vault.setLocalKeyMaterial`); an
> account's recovery is refused offline. Both a change and a recovery drop the biometric
> enrollment: it holds the old password.

### D11 — Binding ciphertext to its context (crypto v2)

With no existing data there is no lazy migration to wait for. AEAD binding (*Bind record
ciphertext to identity*) is part of the new baseline format from the start, instead of a later
`cryptoVersion` 2. The AAD binds to identifiers that exist offline:

- records: `recordId ‖ vaultId ‖ cryptoVersion`
- vault-key wraps: `"vault-key" ‖ vaultId ‖ keyVersion`
- the account-key wrap: purpose only (`"account-key"` + format version)

The AAD never uses the server `userId`, because it doesn't exist before linking.

> **Amended 2026-10-01** (key hierarchy implementation): the account-key wrap was first bound to
> `profileId`. That id is per device, but the same wrapped account key is unwrapped on every
> device of the account, so the binding would break on the second one. Binding it to an identity
> buys nothing anyway: a wrap belonging to another user fails on the wrong KEK. Vault keys keep
> `vaultId ‖ keyVersion`, which stops the server from swapping wraps between the user's own vaults. A record moved
to another vault is re-encrypted anyway (D6).

### D12 — Durability of local-only data

- **Web:** the database lives in OPFS (SQLocal), which the browser can evict. On local vault
  creation call `navigator.storage.persist()`. Show its status and `navigator.storage.estimate()`
  in settings, and warn when persistence is denied.
- **Encrypted export** (*Export: encrypted JSON*) must work in `local` mode. Local-only vaults
  get a recurring backup reminder based on the last export date, together with the "Create
  online account" call to action.
- **Mobile:** document whether the expo-sqlite file is included in iCloud / Android backups.
  Default: included. The data is encrypted, and it is the only copy.

> **Amended 2026-10-08** (durability implementation):
>
> - Web: `CreateLocalVaultPage` calls `persist()` on submit, before the key derivation, while
>   the submit is still a user gesture (Firefox asks; Chrome decides by engagement). Settings →
>   Security shows persistence and the estimate (`StorageSettings`), warns a `local` profile when
>   persistence is denied and can ask again.
> - Backup reminder: the registry keeps `lastExportAt` per profile (`ProfileStore.markExported`,
>   to be called by the export). A `local` profile is reminded once 7 days have passed since the
>   latest of creation, last export and "Later" (`isBackupReminderDue`; the snooze is a per-profile
>   preference). Web shows it as a toast while the vault is open (re-checked hourly and when the
>   tab is visible again; swiping it away also puts it off), linking to "Create online
>   account"; the export call to action joins it with *Export: encrypted JSON*.
> - Mobile, decided: **included** on both platforms. iOS: expo-sqlite keeps the databases in
>   `Documents/SQLite`, which iCloud / Finder backups include; the Keychain items are
>   `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so a restored device unlocks with the password. Android:
>   expo-secure-store's backup rules list only shared prefs, which left the databases **out** of
>   Auto Backup. `plugins/with-android-backup.js` replaces them: `files/SQLite/` and shared prefs
>   in, the SecureStore prefs out (their Keystore key doesn't leave the device). The OS copies
>   the files without asking SQLite, so a backup taken mid-write can be inconsistent; it is a
>   fallback, the export stays the real backup. Android Auto Backup skips an app whose data
>   exceeds 25 MB entirely: a vault with a long history can outgrow it (then excluding the
>   history, or the export, is the way out). The rules are written at prebuild: an existing
>   `apps/mobile/android` needs `expo prebuild --clean` (or a new EAS build) to pick them up.
>
> **Amended 2026-10-08** (export implementation):
>
> - One plaintext document (`ExportData`, `@repo/schema` `export-schema.ts`): every vault (id,
>   decrypted name, kind) and the current version of every live record, unsynced local edits
>   included; no history, no keys. Read from the local database (`collectExportData`), so it works
>   in `local` mode and offline. A record that doesn't open is left out and counted (`skipped`).
> - **Encrypted backup**: `ExportData` sealed in an `ExportEnvelope` (`@repo/crypto`
>   `export-envelope.ts`): Argon2id (master-password cost, new salt) over a password chosen for the
>   file, XChaCha20-Poly1305, AAD `passmgr/export/v1`. It opens without the account, and it counts
>   as a backup: `ProfileStore.markExported` puts the reminder off.
> - **Every export asks for the master password** (checked against the stored wrap): otherwise
>   whoever sits at an unlocked session takes the whole vault in one click, an encrypted backup
>   included, since they pick its password.
> - **Plain JSON / CSV**: the same data unencrypted, behind a warning; not counted as a backup. CSV: login columns plus a `fields`
>   column ("key: value" lines) for every other type, so nothing is dropped. Free-text columns
>   get a `'` before a leading `=`/`+`/`-`/`@` (CSV injection from a shared vault); credentials
>   stay unchanged for the importer. Reading an export back (`decryptExport`) checks each
>   record's id, vault and type, not its fields: one odd record must not make a backup unreadable.
> - The encrypted export counts once saved (`useExport().markSaved`), not when it is built.
> - Web: Settings → Security → Export; the reminder's "Back up" leads there. Mobile has no export
>   UI yet (`useExport` is shared; saving the file needs a share sheet).

## Consequences

**Positive**

- The app is fully usable without a server, and self-hosters can start without one.
- Password change, recovery and rekey touch one key (`accountKey`) instead of the data keys.
- Vaults, sharing and new record types fit in without further changes to the data format.
- The sync bugs already on the board (hard `CONFLICT`, timestamp cursor, no pagination, silent
  sync errors) are fixed as part of this work.

**Negative / costs**

- One more key level to implement and test.
- The client gets a merge engine and an outbox, which are the hardest parts to test. They need
  dedicated two-device tests.
- Local-only web users can lose data through browser eviction. This is mitigated, not solved.
- Breaking change for every dev install: server and local databases are reset when this lands.

## Implementation order

Matches the kanbot backlog. Every step depends on this ADR.

1. Local DB migration runner + new baseline schema (profile, `vaults`, `records.vaultId`,
   `syncState`, outbox). Reset, no migration of the current tables
2. Key hierarchy v2 (D3) + X25519 keypair (D7) + AEAD binding (D11)
3. Vault-scoped data model, local + server (D6)
4. Typed payload schema (D4)
5. Session modes (D2)
6. Local vault creation
7. Local-first record repository + outbox
8. Sequence cursor → conflict strategy (D5) → `record.push` → two-way sync engine → pull pagination (D8)
9. Account linking (D9)
10. Local account operations (D10)
11. Web durability + encrypted export (D12)
12. Offline-first UI
13. E2E tests + docs

**After that (P1):** record type UI, multi-vault UI, vault-key rotation, shared vaults, sharing
UI.

## Open questions

- Whether pushing the full local history when linking needs a size cap (ties into
  *Input size limits + per-user storage quota*).
- Whether accepted shared vaults keep the sealed copy or always re-wrap under `accountKey`
  (D7). Current plan: re-wrap.
