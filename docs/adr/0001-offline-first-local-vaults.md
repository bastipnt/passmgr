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
- Multiple profiles per device are out of scope. Signing into an existing account on a device
  that has an unlinked local profile is handled in D9.

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

**Signing into an existing account on a device with an unlinked local profile:** the user
chooses between

- **Merge:** the local vault keys are re-wrapped under the account's `accountKey` and uploaded
  as additional vaults. Records are not re-encrypted.
- **Replace:** delete the local data, after an explicit confirmation and an export prompt.

There is never a silent wipe.

### D10 — Account operations without a server

- **Local mode:** password change (rewrap `accountKey`), Argon2 rekey, recovery with the
  recovery key (unwrap `accountKey`, set a new password, issue a new recovery key) and biometric
  enrollment all run fully on the device.
- **Linked mode:** password change and recovery need the server: a new OPAQUE registration
  record, a new key set and `freshAuthProcedure`. They are **blocked while offline**, otherwise
  the local and server key sets would diverge. An Argon2 rekey is also deferred until online.

### D11 — Binding ciphertext to its context (crypto v2)

With no existing data there is no lazy migration to wait for. AEAD binding (*Bind record
ciphertext to identity*) is part of the new baseline format from the start, instead of a later
`cryptoVersion` 2. The AAD binds to identifiers that exist offline:

- records: `recordId ‖ vaultId ‖ cryptoVersion`
- vault-key wraps: `"vault-key" ‖ vaultId ‖ keyVersion`
- the account-key wrap: `"account-key" ‖ profileId`

The AAD never uses the server `userId`, because it doesn't exist before linking. A record moved
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
