import {
  type OpenedInvitation,
  sharingErrorMessage,
  useVaultInvitations,
  useVaultSharing,
  VAULT_ROLE_LABELS,
} from "@repo/client";
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { useState } from "react";
import { Fingerprint } from "./Fingerprint";
import { VaultTile } from "./VaultTile";

/**
 * Invites to other people's vaults (ADR 0001 D7). Accepting asks to compare the
 * inviter's security code first: it pins their key on this device. Nothing
 * while there are none.
 */
export function VaultInvitations() {
  const { invitations } = useVaultInvitations();
  const { acceptInvitation, declineInvitation, pending } = useVaultSharing();
  const [error, setError] = useState<string>();
  // Kept while the confirmation closes, so its text doesn't change mid-animation.
  const [joining, setJoining] = useState<OpenedInvitation>();
  const [joinOpen, setJoinOpen] = useState(false);

  if (invitations.length === 0) return null;

  async function accept({ invitation, meta }: OpenedInvitation) {
    setError(undefined);
    try {
      await acceptInvitation(invitation);
      toast.success(`You joined “${meta.name}”`);
    } catch (e) {
      setError(
        sharingErrorMessage(e, "The invite couldn't be accepted. Try again.", {
          NOT_FOUND: "This invite was withdrawn.",
          CONFLICT: "The vault's key changed meanwhile. Ask them to invite you again.",
        }),
      );
    }
  }

  async function decline({ invitation, meta }: OpenedInvitation) {
    setError(undefined);
    try {
      await declineInvitation(invitation.vaultId);
      toast.success(`Invite to “${meta.name}” declined`);
    } catch (e) {
      setError(sharingErrorMessage(e, "The invite couldn't be declined. Try again."));
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="vault-invitations">
      <h2 id="vault-invitations" className="font-medium text-sm">
        Invites
      </h2>
      <ItemGroup>
        {invitations.map((opened) => (
          <Item key={opened.invitation.vaultId} variant="active">
            <ItemMedia>
              <VaultTile vault={opened.meta} />
            </ItemMedia>
            <ItemContent className="min-w-0 gap-1">
              <ItemTitle className="truncate">{opened.meta.name}</ItemTitle>
              <ItemDescription>
                {opened.invitation.sender.email} invited you ·{" "}
                {VAULT_ROLE_LABELS[opened.invitation.role]}
              </ItemDescription>
              <ItemDescription className="text-xs">
                Their security code:{" "}
                <span className="font-mono tracking-wide">{opened.senderFingerprint}</span>
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button variant="outline" disabled={pending} onClick={() => void decline(opened)}>
                Decline
              </Button>
              <Button
                disabled={pending}
                onClick={() => {
                  setJoining(opened);
                  setJoinOpen(true);
                }}
              >
                Accept
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      {error && <FieldError variant="box">{error}</FieldError>}
      {joining && (
        <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Join “{joining.meta.name}”?</DialogTitle>
              <DialogDescription>
                Compare {joining.invitation.sender.email}'s security code with them, by phone or in
                person. They see it under Settings → Vaults. Join only if it matches.
              </DialogDescription>
            </DialogHeader>
            <Fingerprint value={joining.senderFingerprint} className="my-4" />
            <DialogFooter>
              <DialogClose render={<Button variant="secondary">Cancel</Button>} />
              <Button
                onClick={() => {
                  setJoinOpen(false);
                  void accept(joining);
                }}
              >
                Join
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
