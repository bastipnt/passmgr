import { canWriteVault, type DecryptedRecord } from "@repo/schema";
import { useVaults } from "./use-vaults";

/**
 * The vault a record lives in, whether the user may change the record there
 * (not as a `read` member), whether the UI should name the vault at all
 * (more than one exists), and where it can be moved or copied to.
 */
export function useRecordVault(record: Pick<DecryptedRecord, "vaultId"> | undefined) {
  const { getVault, hasSeveralVaults, writableVaults } = useVaults();
  const vault = record ? getVault(record.vaultId) : undefined;
  return {
    vault,
    // Not listed (yet): leave it to the server, which checks every change.
    writable: vault ? canWriteVault(vault.role) : true,
    showVault: hasSeveralVaults,
    /** The other vaults it can move to. */
    moveTargets: writableVaults.filter((target) => target.vaultId !== record?.vaultId),
    // A `read` member may copy it into a vault of their own.
    canDuplicate: writableVaults.length > 0,
  };
}
