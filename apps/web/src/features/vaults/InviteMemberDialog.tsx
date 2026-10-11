import {
  assignableRoles,
  type Invitee,
  sharingErrorMessage,
  useVaultSharing,
  type VaultInfo,
} from "@repo/client";
import { emailSchema, type VaultRole } from "@repo/schema";
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
import { Fingerprint } from "./Fingerprint";
import { RoleSelect } from "./RoleSelect";

type InviteMemberDialogProps = {
  vault: VaultInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Invite someone into a shared vault (ADR 0001 D7) in two steps: look them up
 * by email and pick a role, then compare their key's fingerprint before the
 * vault key is sealed to it.
 */
export function InviteMemberDialog({ vault, open, onOpenChange }: InviteMemberDialogProps) {
  const sharing = useVaultSharing();
  // A new form per opening, as in `VaultDialog`.
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((n) => n + 1);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (sharing.pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <InviteForm
          key={opening}
          vault={vault}
          sharing={sharing}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type InviteFormProps = {
  vault: VaultInfo;
  sharing: ReturnType<typeof useVaultSharing>;
  onDone: () => void;
};

function InviteForm({ vault, sharing, onDone }: InviteFormProps) {
  const { lookupInvitee, invite, pending } = sharing;
  const roles = assignableRoles(vault.role);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<VaultRole>("write");
  const [invitee, setInvitee] = useState<Invitee>();
  const [error, setError] = useState<string>();
  const emailId = useId();
  const roleId = useId();

  async function lookUp(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError("Enter an email address.");
      return;
    }
    setError(undefined);
    try {
      setInvitee(await lookupInvitee(parsed.data));
    } catch (e) {
      setError(
        sharingErrorMessage(e, "They couldn't be looked up. Try again.", {
          NOT_FOUND: "There's no account with this email. They need to sign up first.",
        }),
      );
    }
  }

  async function confirm(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitee) return;
    setError(undefined);
    try {
      await invite(vault.vaultId, invitee, role);
      toast.success(`Invited ${invitee.email} to “${vault.name}”`);
      onDone();
    } catch (e) {
      setError(
        sharingErrorMessage(e, "The invite couldn't be sent. Try again.", {
          NOT_FOUND: "There's no account with this email any more.",
          BAD_REQUEST: "That's your own account.",
          CONFLICT:
            "They're already in this vault or invited, or its key just changed. Check the members and try again.",
          PRECONDITION_FAILED:
            "Their key or yours changed meanwhile, or the vault is full. Look them up again.",
        }),
      );
    }
  }

  if (invitee) {
    return (
      <form onSubmit={confirm}>
        <DialogHeader>
          <DialogTitle>Compare the security code</DialogTitle>
          <DialogDescription>
            Ask {invitee.email} to read you the code under Settings → Vaults on their device, by
            phone or in person. If it matches, the vault key can only be opened by them.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="my-4 gap-4">
          <Fingerprint value={invitee.fingerprint} />
          {error && <FieldError variant="box">{error}</FieldError>}
        </FieldGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setInvitee(undefined);
              setError(undefined);
            }}
          >
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            Invite
            {pending && <Spinner data-icon="inline-end" />}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  return (
    <form onSubmit={lookUp}>
      <DialogHeader>
        <DialogTitle>Share “{vault.name}”</DialogTitle>
        <DialogDescription>
          They see every item in this vault once they accept. Only people with an account can be
          invited.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="my-4 gap-4">
        <Field>
          <FieldLabel htmlFor={emailId}>Email</FieldLabel>
          <Input
            id={emailId}
            type="email"
            value={email}
            autoComplete="off"
            disabled={pending}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={roleId}>Role</FieldLabel>
          <RoleSelect
            id={roleId}
            value={role}
            roles={roles}
            disabled={pending}
            onValueChange={setRole}
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
        <Button type="submit" disabled={pending}>
          Continue
          {pending && <Spinner data-icon="inline-end" />}
        </Button>
      </DialogFooter>
    </form>
  );
}
