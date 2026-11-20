import { canManageVault } from "@repo/schema";
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
