import { useGetRecords, useVaultActions, type VaultInfo, vaultErrorMessage } from "@repo/client";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@repo/ui/components/Field";
import { Input } from "@repo/ui/components/Input";
import { Spinner } from "@repo/ui/components/Spinner";
import { type SubmitEvent, useId, useState } from "react";

type DeleteVaultDialogProps = {
  vault: VaultInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

/**
 * Delete a vault with every item in it, confirmed by typing its name: it's
 * gone from every device, a linked vault's for every member too.
 */
export function DeleteVaultDialog({
  vault,
  open,
  onOpenChange,
  onDeleted,
}: DeleteVaultDialogProps) {
  const { deleteVault, pending } = useVaultActions();
  const { records } = useGetRecords();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const inputId = useId();
  const count = records.filter((record) => record.vaultId === vault.vaultId).length;
  const confirmed = typed.trim() === vault.name;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    try {
      await deleteVault(vault.vaultId);
      toast.success(`Vault “${vault.name}” deleted`);
      onOpenChange(false);
      onDeleted?.();
    } catch (e) {
      setError(vaultErrorMessage(e, "The vault couldn't be deleted. Try again."));
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
        if (next) return;
        setTyped("");
        setError(undefined);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Delete “{vault.name}”?</DialogTitle>
            <DialogDescription>
              {count === 1 ? "Its 1 item" : `Its ${count} items`} and their history are deleted with
              it, on every device. This can't be undone.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="my-4 gap-4">
            <Field>
              <FieldLabel htmlFor={inputId}>Type the vault's name to confirm</FieldLabel>
              <Input
                id={inputId}
                value={typed}
                placeholder={vault.name}
                autoComplete="off"
                disabled={pending}
                onChange={(e) => setTyped(e.target.value)}
              />
            </Field>
            {error && <FieldError variant="box">{error}</FieldError>}
          </FieldGroup>

          <DialogFooter>
            <DialogClose
              render={
                <Button variant="secondary" disabled={pending}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" variant="destructive" disabled={!confirmed || pending}>
              Delete vault
              {pending && <Spinner data-icon="inline-end" />}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
