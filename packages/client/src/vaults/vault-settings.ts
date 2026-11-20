import { canAssignRole, canManageVault, type VaultRole } from "@repo/schema";
import type { MemberInfo } from "./sharing";
import type { VaultInfo } from "./vault-info";

export type VaultSettingsActions = { edit: boolean; rotateKey: boolean; delete: boolean };

/**
 * The vault actions the user's role allows (ADR 0001 D6, D7): edit and rotate its key for owners
 * and managers, delete for owners, never the personal vault.
 */
export function vaultSettingsActions(
  vault: Pick<VaultInfo, "kind" | "role">,
): VaultSettingsActions {
  const manage = canManageVault(vault.role);
  return {
    edit: manage,
    rotateKey: manage,
    delete: vault.kind !== "personal" && vault.role === "owner",
  };
}

type MemberFacts = Pick<MemberInfo, "role" | "status" | "isSelf" | "keyVerified">;

export type VaultMembersRules = { manage: boolean; lastOwner: boolean; verifyPrompt: boolean };

/**
 * The members screens' rules (ADR 0001 D7). Without `members` (the list didn't load) the last owner
 * is unknown: the server refuses them anyway.
 */
export function vaultMembersRules(
  vault: Pick<VaultInfo, "role">,
  members?: readonly MemberFacts[],
): VaultMembersRules {
  const manage = canManageVault(vault.role);
  const owners = members?.filter((m) => m.role === "owner" && m.status === "active").length;
  return {
    manage,
    lastOwner: vault.role === "owner" && owners !== undefined && owners <= 1,
    verifyPrompt: manage && (members ?? []).some((m) => !m.isSelf && !m.keyVerified),
  };
}

export type MemberActions = { manage: boolean; transfer: boolean; verify: boolean };

/** What the user may do to one member: never above their own role (`canAssignRole`). */
export function memberActions(actorRole: VaultRole, member: MemberFacts): MemberActions {
  const other = !member.isSelf;
  return {
    manage: other && canAssignRole(actorRole, member.role),
    transfer:
      other && actorRole === "owner" && member.status === "active" && member.role !== "owner",
    verify: other && !member.keyVerified,
  };
}
