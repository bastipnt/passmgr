import {
  itemCount,
  ownFingerprint,
  SessionContext,
  useGetRecords,
  useVaultActions,
  useVaults,
  type VaultInfo,
  vaultAccessLabel,
} from "@repo/client";
import { canManageVault } from "@repo/schema";
import { Badge } from "@repo/ui/components/Badge";
import { Button } from "@repo/ui/components/Button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { KeyRoundIcon, PencilLineIcon, PlusIcon, TrashIcon, UsersIcon } from "lucide-react";
import { useContext, useState } from "react";
import { PanelHeader, PanelTitle } from "@/components/AppShell";
import {
  DeleteVaultDialog,
  Fingerprint,
  RevokedVaults,
  RotateVaultKeyDialog,
  VaultDialog,
  VaultInvitations,
  VaultMembersDialog,
  VaultTile,
} from "@/features/vaults";
import CreateAccountDialog from "./CreateAccountDialog";

/**
 * The profile's vaults (ADR 0001 D6): create one, rename it or change its icon
 * and colour or rotate its key (owners and managers), delete it (owners; never
 * the personal one). Shared vaults show their members (ADR 0001 D7): owners and
 * managers invite people there; a local profile needs an online account first.
 * Invites to other people's vaults and changes left over from a lost vault show
 * above the list.
 */
export default function VaultsSettingsPage() {
  const { vaults } = useVaults();
  const { records } = useGetRecords();
  const { canChangeVaults } = useVaultActions();
  const { mode } = useContext(SessionContext);
  const fingerprint = mode === "online" ? ownFingerprint() : undefined;
  const [createOpen, setCreateOpen] = useState(false);
  // The vault a dialog is for stays set while the dialog closes, so its content
  // doesn't change or empty during the exit animation.
  const [editing, setEditing] = useState<VaultInfo>();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<VaultInfo>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rotating, setRotating] = useState<VaultInfo>();
  const [rotateOpen, setRotateOpen] = useState(false);
  const [sharing, setSharing] = useState<VaultInfo>();
  const [membersOpen, setMembersOpen] = useState(false);

  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.vaultId, (counts.get(record.vaultId) ?? 0) + 1);

  return (
    <>
      <PanelHeader className="flex-row items-center justify-between">
        <PanelTitle>Vaults</PanelTitle>
        <Button variant="outline" disabled={!canChangeVaults} onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          New vault
        </Button>
      </PanelHeader>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {!canChangeVaults && (
          <p className="text-muted-foreground text-sm">
            You're offline. Vaults change on the server, so connect to create, edit, delete or share
            one. Shared vaults stay usable meanwhile.
          </p>
        )}
        <VaultInvitations />
        <RevokedVaults />
        <ItemGroup>
          {vaults.map((vault) => {
            const access = vaultAccessLabel(vault);
            const canEdit = canChangeVaults && canManageVault(vault.role);
            const canDelete =
              canChangeVaults && vault.kind !== "personal" && vault.role === "owner";
            return (
              <Item key={vault.vaultId} variant="outline">
                <ItemMedia>
                  <VaultTile vault={vault} />
                </ItemMedia>
                <ItemContent className="min-w-0 gap-1">
                  <ItemTitle className="flex items-center gap-2">
                    <span className="truncate">{vault.name}</span>
                    {access && <Badge variant="outline">{access}</Badge>}
                  </ItemTitle>
                  <ItemDescription>
                    {itemCount(counts.get(vault.vaultId) ?? 0)}
                    {vault.kind === "personal" &&
                      " · new items go here unless you pick another vault"}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {vault.kind === "shared" && (
                    <MembersButton
                      vault={vault}
                      local={mode === "local"}
                      disabled={mode === "offline"}
                      onOpen={() => {
                        setSharing(vault);
                        setMembersOpen(true);
                      }}
                    />
                  )}
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Edit ${vault.name}`}
                      onClick={() => {
                        setEditing(vault);
                        setEditOpen(true);
                      }}
                    >
                      <PencilLineIcon />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Rotate the key of ${vault.name}`}
                      title="Rotate key"
                      onClick={() => {
                        setRotating(vault);
                        setRotateOpen(true);
                      }}
                    >
                      <KeyRoundIcon />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost-destructive"
                      size="icon"
                      aria-label={`Delete ${vault.name}`}
                      onClick={() => {
                        setDeleting(vault);
                        setDeleteOpen(true);
                      }}
                    >
                      <TrashIcon />
                    </Button>
                  )}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
        {fingerprint && (
          <section className="flex flex-col gap-2" aria-labelledby="own-fingerprint">
            <h2 id="own-fingerprint" className="font-medium text-sm">
              Your security code
            </h2>
            <p className="text-muted-foreground text-sm">
              Someone sharing a vault with you sees this code for you. Read it to them so they know
              the vault key reaches you and nobody else.
            </p>
            <Fingerprint value={fingerprint} className="sm:max-w-sm" />
          </section>
        )}
      </div>

      <VaultDialog open={createOpen} onOpenChange={setCreateOpen} />
      <VaultDialog open={editOpen} vault={editing} onOpenChange={setEditOpen} />
      {deleting && (
        <DeleteVaultDialog vault={deleting} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
      {rotating && (
        <RotateVaultKeyDialog vault={rotating} open={rotateOpen} onOpenChange={setRotateOpen} />
      )}
      {sharing && (
        <VaultMembersDialog vault={sharing} open={membersOpen} onOpenChange={setMembersOpen} />
      )}
    </>
  );
}

type MembersButtonProps = {
  vault: VaultInfo;
  /** A local profile shares nothing: the button offers an online account instead. */
  local: boolean;
  disabled: boolean;
  onOpen: () => void;
};

/** Open a shared vault's members (and invite); offline it's disabled, local it leads to an account. */
function MembersButton({ vault, local, disabled, onOpen }: MembersButtonProps) {
  const button = (
    <Button
      variant="outline"
      size="icon"
      aria-label={local ? `Share ${vault.name}` : `Members of ${vault.name}`}
      title={
        local
          ? "Sharing needs an online account"
          : disabled
            ? "Connect to see members or share"
            : "Members and sharing"
      }
      disabled={disabled}
      onClick={local ? undefined : onOpen}
    >
      <UsersIcon />
    </Button>
  );
  return local ? <CreateAccountDialog>{button}</CreateAccountDialog> : button;
}
