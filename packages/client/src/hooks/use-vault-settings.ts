import { vaultMetaSchema } from "@repo/schema";
import { useState } from "react";
import {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
  type VaultColor,
  type VaultIcon,
  type VaultInfo,
  vaultColor,
  vaultIcon,
} from "../vaults/vault-info";
import { vaultErrorMessage } from "../vaults/vault-labels";
import type { useVaultActions } from "./use-vaults";

/** The screen's `useVaultActions()`, passed in so a form shares its `pending` with the screen. */
type VaultActions = ReturnType<typeof useVaultActions>;

export const VAULT_NAME_INVALID_MESSAGE = "Give the vault a name (up to 64 characters).";
export const VAULT_SAVE_FAILED_MESSAGE = "The vault couldn't be saved. Try again.";
export const VAULT_ROTATE_FAILED_MESSAGE = "The key couldn't be rotated. Try again.";
export const VAULT_DELETE_FAILED_MESSAGE = "The vault couldn't be deleted. Try again.";

/** What a saved vault form did: `created` a new vault, or changed `vault`'s name, icon and colour. */
export type SavedVault = { vaultId: string; name: string; created: boolean };

/**
 * A vault's name, icon and colour form: edits `vault`, or creates one without it. `save`
 * validates (`vaultMetaSchema`), then calls `onSaved`; a failure stays in `error`.
 */
export function useVaultForm({
  vault,
  actions,
  onSaved,
}: {
  vault?: VaultInfo;
  actions: Pick<VaultActions, "createVault" | "renameVault">;
  onSaved: (saved: SavedVault) => void;
}) {
  const [name, setName] = useState(vault?.name ?? "");
  const [icon, setIcon] = useState<VaultIcon>(vault ? vaultIcon(vault) : DEFAULT_VAULT_ICON);
  const [color, setColor] = useState<VaultColor>(vault ? vaultColor(vault) : DEFAULT_VAULT_COLOR);
  const [error, setError] = useState<string>();

  async function save() {
    const parsed = vaultMetaSchema.safeParse({ name, icon, color });
    if (!parsed.success) {
      setError(VAULT_NAME_INVALID_MESSAGE);
      return;
    }
    setError(undefined);
    try {
      if (vault) {
        await actions.renameVault(vault.vaultId, parsed.data);
        onSaved({ vaultId: vault.vaultId, name: parsed.data.name, created: false });
      } else {
        const vaultId = await actions.createVault(parsed.data);
        onSaved({ vaultId, name: parsed.data.name, created: true });
      }
    } catch (e) {
      setError(vaultErrorMessage(e, VAULT_SAVE_FAILED_MESSAGE));
    }
  }

  return { name, setName, icon, setIcon, color, setColor, error, save };
}

/** Rotate `vault`'s key (ADR 0001 D7), then `onRotated`; a failure stays in `error`. */
export function useRotateVaultKey({
  vault,
  actions,
  onRotated,
}: {
  vault: VaultInfo;
  actions: Pick<VaultActions, "rotateVaultKey">;
  onRotated: () => void;
}) {
  const [error, setError] = useState<string>();

  async function rotate() {
    setError(undefined);
    try {
      await actions.rotateVaultKey(vault.vaultId);
      onRotated();
    } catch (e) {
      setError(vaultErrorMessage(e, VAULT_ROTATE_FAILED_MESSAGE));
    }
  }

  return { error, rotate, clearError: () => setError(undefined) };
}

/** What deleting a vault with `count` items takes with it. */
export function deleteVaultSummary(count: number): string {
  return `${count === 1 ? "Its 1 item" : `Its ${count} items`} and their history are deleted with it, on every device. This can't be undone.`;
}

/**
 * Delete `vault` with its items once its name is typed (`confirmed`), then `onDeleted`; a
 * failure stays in `error`. `records` are the profile's, to count the vault's items.
 */
export function useDeleteVault({
  vault,
  actions,
  records,
  onDeleted,
}: {
  vault: VaultInfo;
  actions: Pick<VaultActions, "deleteVault">;
  records: readonly { vaultId: string }[];
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const count = records.filter((record) => record.vaultId === vault.vaultId).length;
  const confirmed = typed.trim() === vault.name;

  async function remove() {
    if (!confirmed) return;
    try {
      await actions.deleteVault(vault.vaultId);
      onDeleted();
    } catch (e) {
      setError(vaultErrorMessage(e, VAULT_DELETE_FAILED_MESSAGE));
    }
  }

  function reset() {
    setTyped("");
    setError(undefined);
  }

  return {
    typed,
    setTyped,
    count,
    summary: deleteVaultSummary(count),
    confirmed,
    error,
    remove,
    reset,
  };
}
