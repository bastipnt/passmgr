import { zodResolver } from "@hookform/resolvers/zod";
import {
  DELETE_ACCOUNT_ERROR_MESSAGES,
  unsyncedChangesWarning,
  useDeleteAccount,
  usePendingChangeCount,
  useVaults,
} from "@repo/client";
import { type DeleteAccountFormValues, deleteAccountFormSchema } from "@repo/schema";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/Dialog";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { LockIcon, TrashIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { Link } from "wouter";
import { settingsPaths } from "@/app/route-paths";

/**
 * Delete the online account for good: the server drops every record, its
 * history, the keys and the signed-in devices, and this device drops its copy.
 * Needs the master password (a fresh login) and a connection.
 */
export default function DeleteAccountDialog({
  onDeleted,
  children,
}: {
  onDeleted: () => void;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const { deleteAccount, deleteError, clearDeleteError, soleOwnedVaultIds, deleting, blocked } =
    useDeleteAccount();
  const { getVault } = useVaults();
  const pendingChanges = usePendingChangeCount();
  const { handleSubmit, control, reset } = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountFormSchema),
    defaultValues: { password: "" },
  });

  const onSubmit = async ({ password }: DeleteAccountFormValues) => {
    if (await deleteAccount(password)) onDeleted();
  };

  const error = deleteError ?? (blocked ? "offline" : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        if (next) clearDeleteError();
        else reset();
        setOpen(next);
      }}
    >
      <DialogTrigger render={children} />

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormLock locked={deleting}>
            <DialogHeader>
              <DialogTitle>Delete account?</DialogTitle>
              <DialogDescription>
                This deletes your account and everything stored for it on the server, including the
                history of every item, and removes the vault from this device. Your other devices
                are signed out. Shared vaults keep the items you added to them. This can't be
                undone.
                {unsyncedChangesWarning(pendingChanges)}
              </DialogDescription>
              <DialogDescription>
                Want a copy?{" "}
                <Link href={settingsPaths.security} className="underline underline-offset-4">
                  Export your vault
                </Link>{" "}
                first.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="my-4 gap-4">
              <ControlledPasswordInput
                control={control}
                name="password"
                label="Password"
                autoComplete="current-password"
                leadingIcon={<LockIcon />}
              />
              {error && (
                <FieldError variant="box">
                  {DELETE_ACCOUNT_ERROR_MESSAGES[error]}
                  {error === "sole_owner" && soleOwnedVaultIds.length > 0 && (
                    <ul className="mt-1 list-disc pl-5">
                      {soleOwnedVaultIds.map((id) => (
                        <li key={id}>{getVault(id)?.name ?? "A vault not on this device yet"}</li>
                      ))}
                    </ul>
                  )}
                </FieldError>
              )}
            </FieldGroup>

            <DialogFooter>
              <DialogClose
                render={
                  <Button variant="secondary" disabled={deleting}>
                    Cancel
                  </Button>
                }
              />
              <Button type="submit" variant="destructive" disabled={deleting || blocked}>
                {deleting ? <Spinner /> : <TrashIcon />}
                Delete account
              </Button>
            </DialogFooter>
          </FormLock>
        </form>
      </DialogContent>
    </Dialog>
  );
}
