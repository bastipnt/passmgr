import { useDeleteVault, useGetRecords, useVaultActions, type VaultInfo } from "@repo/client";
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
import { type SubmitEvent, useId } from "react";

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
  const actions = useVaultActions();
  const { pending } = actions;
  const { records } = useGetRecords();
  const { typed, setTyped, summary, confirmed, error, remove, reset } = useDeleteVault({
    vault,
    actions,
    records,
    onDeleted: () => {
      toast.success(`Vault “${vault.name}” deleted`);
      onOpenChange(false);
      onDeleted?.();
    },
  });
  const inputId = useId();

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await remove();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Delete “{vault.name}”?</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
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
