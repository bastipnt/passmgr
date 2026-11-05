import { zodResolver } from "@hookform/resolvers/zod";
import { EMAIL_VERIFICATION_ERROR_MESSAGES, useEmailVerification } from "@repo/client";
import { verifyEmailInputSchema } from "@repo/schema";
import { useForm } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import { FieldDescription, FieldError, FieldGroup } from "@repo/ui/components/Field";
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { MailCheckIcon, SendIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type z from "zod";

type FormValues = z.infer<typeof verifyEmailInputSchema>;

/**
 * Enter the code mailed to the account's address. "Later" just closes it: the
 * vault works on this device meanwhile, it only doesn't sync.
 */
export default function VerifyEmailDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { email, verify, resend, error, clearError, pending } = useEmailVerification();
  const [resent, setResent] = useState(false);
  const { handleSubmit, control, reset } = useForm<FormValues>({
    resolver: zodResolver(verifyEmailInputSchema),
    defaultValues: { code: "" },
  });

  const onSubmit = async ({ code }: FormValues) => {
    if (await verify(code)) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          clearError();
          reset();
          setResent(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormLock locked={pending !== undefined}>
            <DialogHeader>
              <DialogTitle>Verify your email</DialogTitle>
              <DialogDescription>
                Enter the 6-digit code we sent to {email ?? "your email address"}. Your vault syncs
                once it is verified; until then it stays on this device.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="my-4 gap-4">
              <ControlledInput
                control={control}
                name="code"
                label="Code from the email"
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="123456"
                leadingIcon={<MailCheckIcon />}
              />
              {resent && !error && <FieldDescription>A new code is on its way.</FieldDescription>}
              {error && (
                <FieldError variant="box">{EMAIL_VERIFICATION_ERROR_MESSAGES[error]}</FieldError>
              )}
            </FieldGroup>

            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                disabled={pending !== undefined}
                onClick={() => void resend().then(setResent)}
              >
                {pending === "resend" ? <Spinner /> : <SendIcon />}
                Send a new code
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending !== undefined}
                  onClick={() => onOpenChange(false)}
                >
                  Later
                </Button>
                <Button type="submit" disabled={pending !== undefined}>
                  {pending === "verify" ? <Spinner /> : <MailCheckIcon />}
                  Verify
                </Button>
              </div>
            </DialogFooter>
          </FormLock>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Accounts the prompt already opened for in this page load: "Later" isn't asked again. */
const prompted = new Set<string>();

/** Opens `VerifyEmailDialog` by itself once per account and page load while the email needs it. */
export function VerifyEmailPrompt() {
  const { required, email } = useEmailVerification();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!required || !email || prompted.has(email)) return;
    prompted.add(email);
    setOpen(true);
  }, [required, email]);

  return <VerifyEmailDialog open={open} onOpenChange={setOpen} />;
}
