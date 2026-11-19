# Vault sharing

How a vault is shared between accounts (ADR 0001 D7). The server stores who is a member of a vault
and with which role. It never sees a vault key.

## Keys

- Every user has an X25519 keypair. The public key is published; the private key is wrapped by the
  account key.
- A vault key travels to another member **sealed** to their public key (`sealVaultKey`). The seal
  combines an ephemeral key with the sender's own key, so a box opens only as coming from the
  person who sealed it. Someone without the sender's private key (including the server) can't
  forge one in their name.
- The recipient opens the box and stores their own copy of the key, wrapped under their account
  key (`vault.acceptKey`). From then on it unlocks like any other vault.

## Invite and accept

1. An owner or manager looks up the invitee by email (`user.publicKey`) and compares the key's
   fingerprint with them out of band.
2. They seal the vault's current key to that key (`vault.invite`). The server stores a `pending`
   membership with the role. Nobody can give a role above their own, only owners make owners, and
   the personal vault can't be shared.
3. The invitee sees the invite (`vault.invitations`), compares the inviter's fingerprint, and
   accepts (the membership becomes `active`) or declines.

## Roles

`owner` > `manage` (invite, remove, rename, rotate) > `write` > `read`. The server enforces them on
every write, member change and metadata update. Managers can't touch or create owners. The last
owner can't leave or be demoted; they hand the vault over first (`vault.transferOwnership`) or
delete it.

## Removing a member, leaving

Whoever leaves still knows the current key, so the vault gets a new one:

- Removing a member, leaving or declining an invite marks the vault `keyRotationNeeded`.
- The device that removed someone rotates right away. Otherwise the next owner or manager whose
  device syncs does it (`rotationsDue` in `record.sync`).
- A rotation creates a new key, keeps the old one wrapped under it (so the history stays
  readable), re-encrypts the live records, and seals the new key to every remaining member and
  invitee.
- Each member's device picks up the new key on its next sync (`keyUpdates`) and accepts it only if:
  - it opens from the sender's key;
  - the sender is listed as an active owner or manager with the key this device pinned for them;
  - this device didn't remove the sender itself;
  - the key's chain leads down to the key the device already holds.

## Trusting public keys

Public keys come from the server, which could hand out its own, or list a "member" of its own.
Each device pins a key only after the user checked it: the invitee's when inviting, the inviter's
when accepting (both after the fingerprint check), and any other member's when the user compares
codes with them and marks them verified. Nothing is pinned silently.

- A rotation (manual, after a removal, or for `rotationsDue`) seals the new key only to pinned
  keys. A listed member without a pin aborts it before anything is sealed; the user sees who to
  verify. A key that differs from its pin is refused.
- A new key from someone else's rotation is taken only from a pinned sender.
- The personal vault's key is never sealed to anyone: the client refuses whatever members or
  `rotationsDue` the server sends for it (the server also refuses to share it).

A consequence: a member who joined through someone else's invite has to be verified on each device
before that device rotates the vault or takes a new key from them.

**Residual risk:** pins are per device, so each device verifies members on its own. A
member-signed membership list would let devices verify members they didn't check themselves (not
built yet). A removed member still knows the old key. Together with a server that lies
about the membership to devices that didn't do the removal, they could pass off a forged
rotation. Closing this needs a membership log signed by members (not built yet).

## Losing access while offline

When a vault is removed from someone while their device still has unsent edits in it, the server
rejects those edits and the next sync drops the vault. The latest unsent version of each record
is kept aside (`revoked_vaults` / `revoked_records`). The user can copy those records into a vault
they can still edit, or discard them. Leaving a vault keeps unsent edits the same way.

## Where it lives

- Crypto: `packages/crypto/src/user-key-pair.ts` (`sealVaultKey`, `openSealedVaultKey`)
- Server: `apps/server/src/vault/sharing.ts`, `vault/router.ts` (`rotateKey`), `vault/access.ts`
- Client: `packages/client/src/vaults/sharing.ts`, `vaults/revoked.ts`,
  `hooks/use-vault-sharing.ts`; key handling in `packages/store/src/secrets-store.ts`
- Background: ADR 0001 D7, `threat-model-inputs.md`
