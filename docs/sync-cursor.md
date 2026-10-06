# Sync cursor (`records.seq`)

How a device pulls only what changed since its last sync, and why the cursor is a per-vault
sequence instead of a timestamp. Decision: ADR 0001 D8 (amendment 2026-10-06).

## What `seq` is

Every row in `records` (each version: create, edit, tombstone) gets a number `seq`: a **write
counter per vault**. The first row written to vault P gets 1, the next 2, and so on; vault W
counts on its own, starting at 1 again.

The counter lives on the vault, in `vaults.lastSeq`. Each write runs, inside its transaction:

```sql
UPDATE vaults SET "lastSeq" = "lastSeq" + 1 WHERE "vaultId" = $1 RETURNING "lastSeq"
```

and stores the returned value as the new row's `records.seq`. `(vaultId, seq)` is unique.
Server code: `nextVaultSeq` / `nextVaultSeqs` in `apps/server/src/vault/access.ts`. Every insert
into `records` must take one.

## How the cursor works

The device keeps one number per vault: the highest `seq` it has pulled from that vault (local
`sync_meta`, key `pullSeq:<vaultId>`).

```
device                                server
  │  record.sync { cursors: { P: 4, W: 2 } }
  │ ─────────────────────────────────►  SELECT … WHERE (vault=P AND seq>4)
  │                                                 OR (vault=W AND seq>2)
  │                                                 OR (vault=X)        ← no cursor: full pull
  │  { records, vaults, cursors: { P: 7, W: 2, X: 3 } }
  │ ◄─────────────────────────────────
  │  applySync: store records + new cursors in one local transaction
```

- **Vault with a cursor:** only rows with a higher `seq` come back.
- **Vault without a cursor** (new to this device, or just shared with the user): pulled in full.
- **The new cursor** for each vault is the highest `seq` among the returned rows. If nothing new
  came back, the old cursor is returned unchanged.
- **Lost vault:** the device deletes its records and its cursor (`Vault.applySync`). If access
  comes back later, the vault is pulled in full again.
- **A stored cursor that isn't a valid seq** is skipped (that vault is pulled in full) rather than
  sent, because the server would reject the whole pull.

## Why not `updated_at`, and why the lock matters

A cursor only works if this holds: **once a device has seen N, nothing ≤ N can show up later.**

Timestamps break that. Transaction A takes `updated_at = 10:00:00.100` but commits late;
transaction B takes `.200` and commits first. A pull in between sees B and moves the cursor to
`.200`. Then A commits with `.100` and is never pulled.

A plain global sequence (`bigserial`) breaks it the same way. The number is handed out at
insert, but the row only becomes visible at commit:

```
tx A: gets seq 5 ........................ COMMIT
tx B:      gets seq 6 ── COMMIT
pull:                          sees 6 → cursor=6     (5 not visible yet → skipped forever)
```

The per-vault counter fixes this. `UPDATE vaults …` **locks that vault's row until the
transaction ends**, so a second writer to the same vault waits at its `UPDATE` until the first
one commits:

```
tx A: lock P, seq 5 ............ COMMIT (unlock)
tx B:      UPDATE P … waits ───────────────────► seq 6 ── COMMIT
```

Seq 6 can't be handed out before seq 5 is committed. So when a pull sees 6, 5 is already
visible, and the rule holds. The pull itself is a single `SELECT` (one snapshot), and the next
cursor is computed from the rows it returned, not from a separate read of `lastSeq`.

Test: `holds a write back until an earlier one to the vault commits, so no pull skips it`
(`apps/server/test/integration/vault.int.test.ts`) holds a write open and checks that a second
write waits for it.

## Details

- **Per vault, not per user.** Shared vaults have several writers, and the device already syncs
  each vault with its own cursor. Different vaults never block each other.
- **Moves** write to two vaults (a new record in the target, a tombstone in the source). Both
  vaults are locked in id order, so two opposite moves can't deadlock.
- **Cost.** Writes to one vault go one at a time, but only for the few milliseconds the
  transaction lasts, which is fine at password-manager write rates.
- **`serverTimestamp`** is still returned by `record.sync`, but only as the clock cap for the
  field merge (ADR 0001 D5). It is no longer a cursor.
- **Open points** (planned with `record.push`): compare the base version *under* the vault lock,
  and set a `lock_timeout` so a stuck transaction can't block a vault's writes indefinitely.
