import { secretsStore } from "@repo/store";
import { useEffect, useState } from "react";
import { useSortedRecords } from "../providers/SortedRecordsProvider";
import { useVaults } from "./use-vaults";

/**
 * Where a new item goes: the vault in view when the user may write to it,
 * else the personal vault; the picker changes it until `open` turns false.
 */
export function useTargetVault(open = true) {
  const { vaultFilter } = useSortedRecords();
  const { writableVaults } = useVaults();
  const [picked, setPicked] = useState<string>();
  const inView = writableVaults.find((vault) => vault.vaultId === vaultFilter)?.vaultId;
  const fallback = inView ?? secretsStore.defaultVaultId;
  const valid = writableVaults.some((vault) => vault.vaultId === picked);

  // Every opening starts from the vault in view again.
  useEffect(() => {
    if (!open) setPicked(undefined);
  }, [open]);

  return {
    vaultId: (valid ? picked : undefined) ?? fallback,
    setVaultId: setPicked,
    writableVaults,
    canPick: writableVaults.length > 1,
  };
}
