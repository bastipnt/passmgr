import { useVaultActions, type VaultInfo, vaultErrorMessage } from "@repo/client";
import { toast } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import { FieldError } from "@repo/ui/components/Field";
import { Spinner } from "@repo/ui/components/Spinner";
import { useState } from "react";

type RotateVaultKeyDialogProps = {
  vault: VaultInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Rotate a vault's key (ADR 0001 D7): its items are re-encrypted under a new
 * key, so a copy of the old one opens nothing written from now on.
 */
export function RotateVaultKeyDialog({ vault, open, onOpenChange }: RotateVaultKeyDialogProps) {
  const { rotateVaultKey, pending } = useVaultActions();
  const [error, setError] = useState<string>();

  async function rotate() {
    try {
      await rotateVaultKey(vault.vaultId);
      toast.success(`New key for “${vault.name}”`);
      onOpenChange(false);
    } catch (e) {
      setError(vaultErrorMessage(e, "The key couldn't be rotated. Try again."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setError(undefined);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rotate the key of “{vault.name}”?</DialogTitle>
          <DialogDescription>
            Its items are re-encrypted under a new key, so a copy of the old one (say, on a lost
            device) can't open anything you change from now on. Older versions in the history stay
            under the old key.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <FieldError variant="box" className="my-4">
            {error}
          </FieldError>
        )}

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            }
          />
          <Button onClick={rotate} disabled={pending}>
            Rotate key
            {pending && <Spinner data-icon="inline-end" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
