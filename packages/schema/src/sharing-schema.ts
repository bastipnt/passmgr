import z from "zod";
import { emailSchema } from "./user/email-schema";
import { userPublicKeySchema, vaultKeyLinkSchema, vaultKeyWrapSchema } from "./user/key-schema";
import {
  encryptedVaultMetaSchema,
  sealedVaultKeySchema,
  type VaultRole,
  vaultRoleSchema,
} from "./vault-schema";

// Sharing a vault between accounts (ADR 0001 D7). A vault key travels to a
// member sealed to their public key, authenticated by the sender's keypair
// (`sealVaultKey`); the member opens it and stores their own wrap under their
// account key (`vault.acceptKey`). The server sees who is a member with which
// role, never a vault key.

/** Who sealed a vault key: the keypair the box opens under (`openSealedVaultKey`). */
export const vaultKeySenderSchema = z.object({
  userId: z.uuid(),
  ...userPublicKeySchema.shape,
});

/**
 * A newer key of a vault the user is a member of, sealed to them by the member
 * who rotated it. `links` are the vault's earlier keys from the one the user
 * holds up to the new one, oldest first: the new key must open them down to
 * the user's own, or it isn't this vault's.
 */
export const vaultKeyUpdateSchema = z.object({
  vaultId: z.uuid(),
  keyVersion: z.number().int().positive(),
  sealedVaultKey: sealedVaultKeySchema,
  recipientKeyVersion: z.number().int().positive(),
  sender: vaultKeySenderSchema,
  links: z.array(vaultKeyLinkSchema),
});

/** A pending invite to a vault, as the invitee sees it. */
export const vaultInvitationSchema = z.object({
  vaultId: z.uuid(),
  role: vaultRoleSchema,
  keyVersion: z.number().int().positive(),
  sealedVaultKey: sealedVaultKeySchema,
  recipientKeyVersion: z.number().int().positive(),
  sender: vaultKeySenderSchema.extend({ email: z.string() }),
  ...encryptedVaultMetaSchema.shape,
});

/** A vault's member (or invitee), as the other members see them. */
export const vaultMemberSchema = z.object({
  userId: z.uuid(),
  email: z.string(),
  role: vaultRoleSchema,
  status: z.enum(["active", "pending"]),
  publicKey: userPublicKeySchema,
});

/**
 * Invite a user by email: the vault's current key sealed to their current
 * public key (`recipientKeyVersion`) from the inviter's (`senderKeyVersion`).
 */
export const inviteMemberInputSchema = z.object({
  vaultId: z.uuid(),
  email: emailSchema,
  role: vaultRoleSchema,
  keyVersion: z.number().int().positive(),
  recipientKeyVersion: z.number().int().positive(),
  senderKeyVersion: z.number().int().positive(),
  sealedVaultKey: sealedVaultKeySchema,
});

/**
 * The caller's own wrap of a key sealed to them: accepts an invite (the
 * membership becomes active) or a rotated key.
 */
export const acceptVaultKeyInputSchema = vaultKeyWrapSchema;

export const vaultIdInputSchema = z.object({ vaultId: z.uuid() });

export const vaultMemberInputSchema = z.object({ vaultId: z.uuid(), userId: z.uuid() });

export const setMemberRoleInputSchema = vaultMemberInputSchema.extend({ role: vaultRoleSchema });

const ROLE_RANK: Record<VaultRole, number> = { read: 0, write: 1, manage: 2, owner: 3 };

/** Whether `role` is at least `atLeast` (`owner` > `manage` > `write` > `read`). */
export function roleAtLeast(role: VaultRole, atLeast: VaultRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[atLeast];
}

/**
 * Whether a member with role `actor` may give `role` to someone, or change the
 * role of (or remove) a member who has `role`: owners anything, managers
 * anything below owner, nobody else.
 */
export function canAssignRole(actor: VaultRole, role: VaultRole): boolean {
  if (actor === "owner") return true;
  return actor === "manage" && role !== "owner";
}

export type VaultKeySender = z.infer<typeof vaultKeySenderSchema>;
export type VaultKeyUpdate = z.infer<typeof vaultKeyUpdateSchema>;
export type VaultInvitation = z.infer<typeof vaultInvitationSchema>;
export type VaultMember = z.infer<typeof vaultMemberSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;
