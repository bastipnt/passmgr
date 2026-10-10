import type { VaultRole } from "@repo/schema";
import {
  VaultKeyRotatedElsewhereError,
  VaultRotationUnavailableError,
  VaultsOfflineError,
} from "../hooks/use-vaults";
import type { VaultInfo } from "./vault-info";

export const VAULT_ROLE_LABELS: Record<VaultRole, string> = {
  owner: "Owner",
  manage: "Can manage",
  write: "Can edit",
  read: "Read only",
};

/** What a shared vault's row says about the user's access; nothing for their own. */
export function vaultAccessLabel(vault: VaultInfo): string | undefined {
  return vault.role === "owner" ? undefined : VAULT_ROLE_LABELS[vault.role];
}

/** A failed vault change, for the user: why when it's offline or not possible yet, else `fallback`. */
export function vaultErrorMessage(error: unknown, fallback: string): string {
  return error instanceof VaultsOfflineError ||
    error instanceof VaultRotationUnavailableError ||
    error instanceof VaultKeyRotatedElsewhereError
    ? error.message
    : fallback;
}
