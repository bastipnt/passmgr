import { publicKeyFingerprint } from "@repo/crypto";
import { canAssignRole, type VaultRole } from "@repo/schema";
import { secretsStore } from "@repo/store";
import { TRPCClientError } from "@trpc/client";
import { VaultsOfflineError } from "../hooks/use-vaults";
import { isServerAnswer } from "../util/trpc-errors";
import {
  PeerKeyChangedError,
  VaultKeyRotatedElsewhereError,
  VaultMembersChangedError,
} from "./sharing";
import type { VaultInfo } from "./vault-info";

export const VAULT_ROLE_LABELS: Record<VaultRole, string> = {
  owner: "Owner",
  manage: "Can manage",
  write: "Can edit",
  read: "Read only",
};

/** What each role may do, for the role pickers. */
export const VAULT_ROLE_DESCRIPTIONS: Record<VaultRole, string> = {
  owner: "Everything, including deleting the vault",
  manage: "Edit items, rename the vault, invite and remove people",
  write: "Add, edit and delete items",
  read: "See and copy items",
};

/** The roles in the pickers, highest first. */
const VAULT_ROLES: readonly VaultRole[] = ["owner", "manage", "write", "read"];

/** The roles a member with role `actor` may give (`canAssignRole`), highest first. */
export function assignableRoles(actor: VaultRole): VaultRole[] {
  return VAULT_ROLES.filter((role) => canAssignRole(actor, role));
}

/** What a shared vault's row says about the user's access; nothing for their own. */
export function vaultAccessLabel(vault: VaultInfo): string | undefined {
  return vault.role === "owner" ? undefined : VAULT_ROLE_LABELS[vault.role];
}

/** The signed-in user's key fingerprint, for others to compare with what they see. */
export function ownFingerprint(): string | undefined {
  const publicKey = secretsStore.userPublicKey;
  return publicKey ? publicKeyFingerprint(publicKey) : undefined;
}

/** A failed vault change, for the user: why when it's offline or not possible now, else `fallback`. */
export function vaultErrorMessage(error: unknown, fallback: string): string {
  return error instanceof VaultsOfflineError ||
    error instanceof VaultMembersChangedError ||
    error instanceof VaultKeyRotatedElsewhereError ||
    error instanceof PeerKeyChangedError
    ? error.message
    : fallback;
}

/** Server refusals a sharing call can meet, by tRPC code. */
export type SharingRefusal =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "PRECONDITION_FAILED"
  | "BAD_REQUEST";

/** What each refusal means for one sharing call. */
export type SharingRefusals = Partial<Record<SharingRefusal, string>>;

/**
 * A failed sharing call, for the user: `byCode` says what a refusal means for
 * this call (they differ per call); otherwise as `vaultErrorMessage`, or that
 * the server wasn't reached.
 */
export function sharingErrorMessage(
  error: unknown,
  fallback: string,
  byCode: SharingRefusals = {},
): string {
  if (error instanceof TRPCClientError) {
    const message = byCode[error.data?.code as SharingRefusal];
    if (message) return message;
    if (!isServerAnswer(error)) return "The server can't be reached. Try again.";
    if (error.data?.code === "FORBIDDEN") return "Your role in this vault doesn't allow this.";
  }
  return vaultErrorMessage(error, fallback);
}

/** The server's word for "a vault always keeps an owner" (`setMemberRole`, `leave`). */
export const LAST_OWNER_MESSAGE =
  "A vault needs an owner. Make someone else owner first, or delete the vault.";

/** The server's word for "only a member who joined can own the vault" (`transferOwnership`). */
export const NOT_JOINED_MESSAGE = "They have to accept the invite before they can own the vault.";
