import {
  assignableRoles,
  LAST_OWNER_MESSAGE,
  type MemberInfo,
  NOT_JOINED_MESSAGE,
  type SharingRefusals,
  sharingErrorMessage,
  useVaultMembers,
  useVaultSharing,
  VAULT_ROLE_LABELS,
  type VaultInfo,
} from "@repo/client";
import { canAssignRole, canManageVault, type VaultRole } from "@repo/schema";
import { toast } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Badge } from "@repo/ui/components/Badge";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import { FieldError } from "@repo/ui/components/Field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Skeleton } from "@repo/ui/components/Skeleton";
import { CrownIcon, EllipsisIcon, LogOutIcon, UserMinusIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { RoleSelect } from "./RoleSelect";
import { VaultTile } from "./VaultTile";

type VaultMembersDialogProps = {
  vault: VaultInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the user left the vault. */
  onLeft?: () => void;
};

/** A confirmation the dialog is asking for. */
type Pending =
  | { kind: "remove"; member: MemberInfo }
  | { kind: "transfer"; member: MemberInfo }
  | { kind: "leave" };

/**
 * Who is in a shared vault (ADR 0001 D7), with their key fingerprints. Owners
 * and managers invite people, change roles (never above their own) and remove
 * members, which rotates the vault's key; owners hand the vault over. Anyone
 * but the last owner can leave.
 */
export function VaultMembersDialog({ vault, open, onOpenChange, onLeft }: VaultMembersDialogProps) {
  const {
    members,
    isPending,
    error: loadError,
  } = useVaultMembers(open ? vault.vaultId : undefined);
  const sharing = useVaultSharing();
  const { pending } = sharing;
  const [error, setError] = useState<string>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<Pending>();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const manages = canManageVault(vault.role);
  const owners = members.filter((m) => m.role === "owner" && m.status === "active").length;
  // Unknown while the list didn't load: the server refuses the last owner anyway.
  const lastOwner = vault.role === "owner" && !loadError && owners <= 1;

  function ask(next: Pending) {
    setError(undefined);
    setConfirm(next);
    setConfirmOpen(true);
  }

  async function run(
    action: () => Promise<void>,
    fallback: string,
    success: string,
    byCode: SharingRefusals = {},
  ) {
    setError(undefined);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (e) {
      setError(
        sharingErrorMessage(e, fallback, {
          NOT_FOUND: "They aren't in this vault any more.",
          ...byCode,
        }),
      );
      return false;
    }
  }

  function changeRole(member: MemberInfo, role: VaultRole) {
    if (role === member.role) return;
    void run(
      () => sharing.setMemberRole(vault.vaultId, member.userId, role),
      "The role couldn't be changed. Try again.",
      `${member.email} is now “${VAULT_ROLE_LABELS[role]}”`,
      { PRECONDITION_FAILED: LAST_OWNER_MESSAGE },
    );
  }

  async function confirmed() {
    if (!confirm) return;
    setConfirmOpen(false);
    if (confirm.kind === "remove") {
      const { member } = confirm;
      await run(
        () => sharing.removeMember(vault.vaultId, member.userId),
        "They couldn't be removed. Try again.",
        member.status === "pending"
          ? `Invite for ${member.email} withdrawn`
          : `${member.email} removed. The vault gets a new key.`,
      );
    } else if (confirm.kind === "transfer") {
      const { member } = confirm;
      await run(
        () => sharing.transferOwnership(vault.vaultId, member.userId),
        "The vault couldn't be handed over. Try again.",
        `${member.email} now owns “${vault.name}”`,
        { PRECONDITION_FAILED: NOT_JOINED_MESSAGE },
      );
    } else {
      const left = await run(
        () => sharing.leaveVault(vault.vaultId),
        "You couldn't leave the vault. Try again.",
        `You left “${vault.name}”`,
        { PRECONDITION_FAILED: LAST_OWNER_MESSAGE },
      );
      if (left) {
        onOpenChange(false);
        onLeft?.();
      }
    }
  }

  return (
    <>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="flex-row items-center gap-3">
            <VaultTile vault={vault} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <DialogTitle className="truncate">Members of “{vault.name}”</DialogTitle>
              <DialogDescription>
                Compare a security code with its person before you trust it.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="my-4 flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {isPending ? (
              <div className="flex flex-col gap-2" aria-busy>
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : loadError ? (
              <FieldError variant="box">The members couldn't be loaded. Try again.</FieldError>
            ) : (
              <ItemGroup>
                {members.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    actorRole={vault.role}
                    disabled={pending}
                    onRoleChange={(role) => changeRole(member, role)}
                    onRemove={() => ask({ kind: "remove", member })}
                    onTransfer={() => ask({ kind: "transfer", member })}
                  />
                ))}
              </ItemGroup>
            )}
            {error && <FieldError variant="box">{error}</FieldError>}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost-destructive"
              disabled={pending || isPending || lastOwner}
              title={lastOwner ? LAST_OWNER_MESSAGE : undefined}
              onClick={() => ask({ kind: "leave" })}
            >
              <LogOutIcon />
              Leave vault
            </Button>
            {manages && (
              <Button disabled={pending} onClick={() => setInviteOpen(true)}>
                <UserPlusIcon />
                Invite people
              </Button>
            )}
          </DialogFooter>
          {lastOwner && !isPending && (
            <p className="text-muted-foreground text-xs">{LAST_OWNER_MESSAGE}</p>
          )}
        </DialogContent>
      </Dialog>

      {manages && (
        <InviteMemberDialog vault={vault} open={inviteOpen} onOpenChange={setInviteOpen} />
      )}
      {confirm && (
        <RemoveDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onRemove={() => void confirmed()}
          {...confirmText(confirm, vault)}
        />
      )}
    </>
  );
}

function confirmText(confirm: Pending, vault: VaultInfo) {
  switch (confirm.kind) {
    case "remove":
      return confirm.member.status === "pending"
        ? {
            title: `Withdraw the invite for ${confirm.member.email}?`,
            description: "They can't join with it any more. The vault gets a new key.",
            removeTitle: "Withdraw invite",
          }
        : {
            title: `Remove ${confirm.member.email}?`,
            description:
              "They lose the vault on their devices. The vault gets a new key, so they can't open anything changed from now on. What they've already seen, they may have kept.",
            removeTitle: "Remove",
          };
    case "transfer":
      return {
        title: `Make ${confirm.member.email} the owner?`,
        description:
          "They become owner of the vault and you can still manage it. Only an owner can make you owner again.",
        removeTitle: "Hand over",
      };
    case "leave":
      return {
        title: `Leave “${vault.name}”?`,
        description:
          "Its items disappear from your devices. Unsent changes are kept aside so you can copy them to another vault. To get back in, someone has to invite you again.",
        removeTitle: "Leave vault",
      };
  }
}

type MemberRowProps = {
  member: MemberInfo;
  actorRole: VaultRole;
  disabled: boolean;
  onRoleChange: (role: VaultRole) => void;
  onRemove: () => void;
  onTransfer: () => void;
};

function MemberRow({
  member,
  actorRole,
  disabled,
  onRoleChange,
  onRemove,
  onTransfer,
}: MemberRowProps) {
  const manageable = !member.isSelf && canAssignRole(actorRole, member.role);
  const canTransfer =
    !member.isSelf &&
    actorRole === "owner" &&
    member.status === "active" &&
    member.role !== "owner";
  const invited = member.status === "pending";

  return (
    <Item variant="outline" size="sm" className="flex-nowrap">
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle className="flex w-full min-w-0 items-center gap-2">
          <span className="truncate">{member.email}</span>
          {member.isSelf && <Badge variant="secondary">You</Badge>}
          {invited && <Badge variant="outline">Invited</Badge>}
          {!member.keyTrusted && <Badge variant="warning">Key changed</Badge>}
        </ItemTitle>
        <ItemDescription className="font-mono text-xs tracking-wide">
          {member.fingerprint}
        </ItemDescription>
        {!member.keyTrusted && (
          <ItemDescription className="text-xs">
            Their key differs from the one this device used before. Compare the code with them
            before sharing anything new.
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        {manageable ? (
          <RoleSelect
            size="sm"
            className="w-36"
            aria-label={`Role of ${member.email}`}
            value={member.role}
            roles={assignableRoles(actorRole)}
            disabled={disabled}
            onValueChange={onRoleChange}
          />
        ) : (
          <span className="whitespace-nowrap text-muted-foreground text-sm">
            {VAULT_ROLE_LABELS[member.role]}
          </span>
        )}
        {manageable && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`More for ${member.email}`}
                  disabled={disabled}
                >
                  <EllipsisIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {canTransfer && (
                <DropdownMenuItem onClick={onTransfer}>
                  <CrownIcon />
                  Make owner
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                <UserMinusIcon />
                {invited ? "Withdraw invite" : "Remove"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </ItemActions>
    </Item>
  );
}
