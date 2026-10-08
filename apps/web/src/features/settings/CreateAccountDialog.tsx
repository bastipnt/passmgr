import { zodResolver } from "@hookform/resolvers/zod";
import { type LinkAccountError, useAppConfig, useLinkAccount } from "@repo/client";
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
import { ControlledInput } from "@repo/ui/components/form/ControlledInput";
import { ControlledPasswordInput } from "@repo/ui/components/form/ControlledPasswordInput";
import { FormLock } from "@repo/ui/components/form/FormLock";
import { Spinner } from "@repo/ui/components/Spinner";
import { CloudUploadIcon, LockIcon, MailIcon, TicketIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import z from "zod";

const ERRORS: Record<LinkAccountError, string> = {
  wrong_password: "That isn't this vault's master password.",
  registration_failed:
    "The server didn't create the account. Registration may need an invite, or the invite is invalid or for another email.",
  rejected: "This email belongs to another account. Use another email.",
  throttled: "Too many attempts. Wait a few minutes and try again.",
  unreachable: "The server couldn't be reached. Try again; nothing on this device was changed.",
  failed: "Creating the account failed. Try again.",
};

const schema = z.object({
  email: z.email(),
  password: z.string().min(1),
  invite: z.string().max(128),
});

type FormValues = z.infer<typeof schema>;

/**
 * Create an online account from this local vault (ADR 0001 D9): same master
 * password, same recovery key. The vault then syncs with the account.
 */
export default function CreateAccountDialog({ children }: { children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const { registrationEnabled } = useAppConfig();
  const { linkAccount, linkError, clearLinkError, linking } = useLinkAccount();
  const { handleSubmit, control, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", invite: "" },
  });

  const onSubmit = async ({ email, password, invite }: FormValues) => {
    if (await linkAccount(email, password, invite)) {
      reset();
      setOpen(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (linking) return;
        if (next) clearLinkError();
        setOpen(next);
      }}
    >
      <DialogTrigger render={children} />

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormLock locked={linking}>
            <DialogHeader>
              <DialogTitle>Create online account</DialogTitle>
              <DialogDescription>
                Your vault keeps its master password and recovery key. Once the account exists,
                everything in it syncs, end-to-end encrypted.
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="my-4 gap-4">
              <ControlledInput
                control={control}
                name="email"
                label="Email"
                type="email"
                autoComplete="username"
                leadingIcon={<MailIcon />}
              />
              <ControlledPasswordInput
                control={control}
                name="password"
                label="Master password"
                autoComplete="current-password"
                leadingIcon={<LockIcon />}
              />
              {!registrationEnabled && (
                <ControlledInput
                  control={control}
                  name="invite"
                  label="Invite code"
                  autoComplete="off"
                  leadingIcon={<TicketIcon />}
                />
              )}
              {linkError && <FieldError variant="box">{ERRORS[linkError]}</FieldError>}
            </FieldGroup>

            <DialogFooter>
              <DialogClose
                render={
                  <Button variant="secondary" disabled={linking}>
                    Cancel
                  </Button>
                }
              />
              <Button type="submit" disabled={linking}>
                {linking ? <Spinner /> : <CloudUploadIcon />}
                Create account
              </Button>
            </DialogFooter>
          </FormLock>
        </form>
      </DialogContent>
    </Dialog>
  );
}
