import {
  type RevokedVaultInfo,
  useRevokedVaults,
  useVaultSharing,
  vaultErrorMessage,
} from "@repo/client";
import { toast } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import { FieldError } from "@repo/ui/components/Field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/Item";
import { useState } from "react";

function changes(count: number): string {
  return count === 1 ? "1 unsent change" : `${count} unsent changes`;
}

/**
 * Vaults the user lost access to (removed, or left) while this device still
 * had unsent changes in them (ADR 0001 D7): copy those into the personal vault
 * or discard them. Nothing while there are none.
 */
export function RevokedVaults() {
  const revoked = useRevokedVaults();
  const { copyRevokedRecords, discardRevokedVault, pending } = useVaultSharing();
  const [error, setError] = useState<string>();
  // Kept while the confirmation closes, so its text doesn't change mid-animation.
  const [discarding, setDiscarding] = useState<RevokedVaultInfo>();
  const [discardOpen, setDiscardOpen] = useState(false);

  if (revoked.length === 0) return null;

  async function copy(vault: RevokedVaultInfo) {
    setError(undefined);
    try {
      const copied = await copyRevokedRecords(vault.vaultId);
      toast.success(
        copied === 1 ? "1 item copied to your vault" : `${copied} items copied to your vault`,
      );
    } catch (e) {
      setError(vaultErrorMessage(e, "The changes couldn't be copied. Try again."));
    }
  }

  async function discard(vault: RevokedVaultInfo) {
    setError(undefined);
    try {
      await discardRevokedVault(vault.vaultId);
    } catch (e) {
      setError(vaultErrorMessage(e, "The changes couldn't be discarded. Try again."));
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="revoked-vaults">
      <h2 id="revoked-vaults" className="font-medium text-sm">
        Changes from vaults you lost
      </h2>
      <ItemGroup>
        {revoked.map((vault) => (
          <Item key={vault.vaultId} variant="outline">
            <ItemContent className="min-w-0 gap-1">
              <ItemTitle className="truncate">{vault.name ?? "A vault"}</ItemTitle>
              <ItemDescription>
                You're no longer in this vault. {changes(vault.records.length)} never reached it.
                {vault.unreadable > 0 && ` ${vault.unreadable} can't be opened any more.`}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="ghost-destructive"
                disabled={pending}
                onClick={() => {
                  setDiscarding(vault);
                  setDiscardOpen(true);
                }}
              >
                Discard
              </Button>
              {vault.records.length > 0 && (
                <Button variant="outline" disabled={pending} onClick={() => void copy(vault)}>
                  Copy to my vault
                </Button>
              )}
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      {error && <FieldError variant="box">{error}</FieldError>}
      {discarding && (
        <RemoveDialog
          open={discardOpen}
          onOpenChange={setDiscardOpen}
          title={`Discard ${changes(discarding.records.length)}?`}
          description="They never reached the vault and can't be brought back."
          removeTitle="Discard"
          onRemove={() => {
            setDiscardOpen(false);
            void discard(discarding);
          }}
        />
      )}
    </section>
  );
}
