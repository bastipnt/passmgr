import { useVaults } from "@repo/client";
import { canWriteVault, type DecryptedRecord } from "@repo/schema";

// TODO: why not shared with mobile? not needed there?

/**
 * The vault a record lives in, whether the user may change the record there
 * (not as a `read` member), and whether the UI should name the vault at all
 * (more than one exists).
 */
export function useRecordVault(record: Pick<DecryptedRecord, "vaultId">) {
  const { getVault, hasSeveralVaults, writableVaults } = useVaults();
  const vault = getVault(record.vaultId);
  return {
    vault,
    // Not listed (yet): leave it to the server, which checks every change.
    writable: vault ? canWriteVault(vault.role) : true,
    showVault: hasSeveralVaults,
    /** The other vaults it can move to. */
    moveTargets: writableVaults.filter((target) => target.vaultId !== record.vaultId),
  };
}
