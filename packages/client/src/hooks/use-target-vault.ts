import { secretsStore } from "@repo/store";
import { useEffect, useState } from "react";
import { useSortedRecords } from "../providers/SortedRecordsProvider";
import { useVaults } from "./use-vaults";

/**
 * Where a new item goes: the first the user may write to of `preferredVaultId`
 * (a copy's source) and the vault in view, else the personal vault; the
 * picker changes it until `open` turns false.
 */
export function useTargetVault(open = true, preferredVaultId?: string) {
  const { vaultFilter } = useSortedRecords();
  const { writableVaults } = useVaults();
  const [picked, setPicked] = useState<string>();
  const writable = (vaultId?: string) =>
    writableVaults.find((vault) => vault.vaultId === vaultId)?.vaultId;

  // Every opening starts over from the default.
  useEffect(() => {
    if (!open) setPicked(undefined);
  }, [open]);

  return {
    vaultId:
      writable(picked) ??
      writable(preferredVaultId) ??
      writable(vaultFilter) ??
      secretsStore.defaultVaultId,
    setVaultId: setPicked,
    writableVaults,
    canPick: writableVaults.length > 1,
  };
}
