import { zodResolver } from "@hookform/resolvers/zod";
import { TWO_FACTOR_ERROR_MESSAGES, type TwoFactorError } from "@repo/client";
import { type TwoFactorPasswordFormValues, twoFactorPasswordFormSchema } from "@repo/schema";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import { DialogClose, DialogFooter } from "@repo/ui/components/Dialog";
import { FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { LockIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The master password a two-factor change starts with (a fresh login), inside a dialog. */
export default function TwoFactorPasswordForm({
  onSubmit,
  error,
  pending,
  submitLabel,
  destructive = false,
  icon,
}: {
  onSubmit: (password: string) => Promise<void>;
  error?: TwoFactorError;
  pending: boolean;
  submitLabel: string;
  destructive?: boolean;
  icon: ReactNode;
}) {
  const { handleSubmit, control } = useForm<TwoFactorPasswordFormValues>({
    resolver: zodResolver(twoFactorPasswordFormSchema),
    defaultValues: { password: "" },
  });

  return (
    <form onSubmit={handleSubmit(({ password }) => onSubmit(password))}>
      <FormLock locked={pending}>
        <FieldGroup className="my-4 gap-4">
          <ControlledPasswordInput
            control={control}
            name="password"
            label="Password"
            autoComplete="current-password"
            leadingIcon={<LockIcon />}
          />
          {error && <FieldError variant="box">{TWO_FACTOR_ERROR_MESSAGES[error]}</FieldError>}
        </FieldGroup>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            }
          />
          <Button
            type="submit"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
          >
            {pending ? <Spinner /> : icon}
            {submitLabel}
          </Button>
        </DialogFooter>
      </FormLock>
    </form>
  );
}
