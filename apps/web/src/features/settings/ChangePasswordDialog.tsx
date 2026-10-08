import { zodResolver } from "@hookform/resolvers/zod";
import { CHANGE_PASSWORD_ERROR_MESSAGES, useChangePassword } from "@repo/client";
import { type ChangePasswordFormValues, changePasswordFormSchema } from "@repo/schema";
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
import { KeyRoundIcon, LockIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { type Control, useWatch } from "react-hook-form";
import { PasswordStrengthMeter } from "@/features/password-generation";

/**
 * Change the master password (ADR 0001 D10). A local vault changes it on this
 * device; an online account needs the server and signs out every other device.
 * The recovery key stays valid either way.
 */
export default function ChangePasswordDialog({
  linked,
  children,
}: {
  linked: boolean;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const { changePassword, changeError, clearChangeError, changing, blocked } = useChangePassword();
  const { handleSubmit, control, reset } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  const onSubmit = async ({ currentPassword, password }: ChangePasswordFormValues) => {
    if (await changePassword(currentPassword, password)) {
      reset();
      setOpen(false);
    }
  };

  const error = changeError ?? (blocked ? "offline" : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (changing) return;
        if (next) clearChangeError();
        else reset();
        setOpen(next);
      }}
    >
      <DialogTrigger render={children} />

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormLock locked={changing}>
            <DialogHeader>
              <DialogTitle>Change master password</DialogTitle>
              <DialogDescription>
                {linked
                  ? "Your other devices are signed out and unlock with the new password. Your recovery key stays the same."
                  : "Only this device holds the vault, so the change stays here. Your recovery key stays the same."}
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="my-4 gap-4">
              <ControlledPasswordInput
                control={control}
                name="currentPassword"
                label="Current password"
                autoComplete="current-password"
                leadingIcon={<LockIcon />}
              />
              <ControlledPasswordInput
                control={control}
                name="password"
                label="New password"
                autoComplete="new-password"
                leadingIcon={<KeyRoundIcon />}
                labelAction={
                  <span className="text-muted-foreground text-xs">min. 8 characters</span>
                }
                hint={<NewPasswordHint control={control} />}
              />
              <ControlledPasswordInput
                control={control}
                name="confirmPassword"
                label="Confirm new password"
                autoComplete="new-password"
                leadingIcon={<KeyRoundIcon />}
              />
              {error && (
                <FieldError variant="box">{CHANGE_PASSWORD_ERROR_MESSAGES[error]}</FieldError>
              )}
            </FieldGroup>

            <DialogFooter>
              <DialogClose
                render={
                  <Button variant="secondary" disabled={changing}>
                    Cancel
                  </Button>
                }
              />
              <Button type="submit" disabled={changing || blocked}>
                {changing ? <Spinner /> : <KeyRoundIcon />}
                Change password
              </Button>
            </DialogFooter>
          </FormLock>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewPasswordHint({ control }: { control: Control<ChangePasswordFormValues> }) {
  const password = useWatch({ control, name: "password" }) ?? "";
  return <PasswordStrengthMeter password={password} />;
}
