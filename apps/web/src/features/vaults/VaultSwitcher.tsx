import {
  useSortedRecords,
  useVaultActions,
  useVaultRecordCounts,
  useVaults,
  type VaultFilter,
  vaultAccessLabel,
} from "@repo/client";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import Link from "@repo/ui/components/Link";
import { ChevronsUpDownIcon, LayersIcon, PlusIcon, Settings2Icon } from "lucide-react";
import { useState } from "react";
import { settingsPaths } from "@/app/route-paths";
import { VaultDialog } from "./VaultDialog";
import { VaultTile } from "./VaultTile";

type VaultSwitcherProps = {
  /**
   * `scope`: the vault in view, by name (desktop header); `floating`: a round
   * bar button showing its tile (phone).
   */
  variant: "scope" | "floating";
};

/** Pick the vault the app shows (or all of them), or create one. */
export function VaultSwitcher({ variant }: VaultSwitcherProps) {
  const { vaults, getVault } = useVaults();
  const counts = useVaultRecordCounts();
  const { vaultFilter, setVaultFilter } = useSortedRecords();
  const { canChangeVaults } = useVaultActions();
  const [createOpen, setCreateOpen] = useState(false);
  const current = vaultFilter === "all" ? undefined : getVault(vaultFilter);
  const name = current?.name ?? "All vaults";
  const total = vaults.reduce((sum, vault) => sum + (counts.get(vault.vaultId) ?? 0), 0);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            variant === "floating" ? (
              <Button variant="floating" size="icon-xl" aria-label={`Vault: ${name}`}>
                {current ? <VaultTile vault={current} size="sm" /> : <LayersIcon />}
              </Button>
            ) : (
              <Button
                variant="ghost"
                aria-label={`Vault: ${name}`}
                className="h-10 min-w-0 max-w-56 gap-2.5 pr-2.5 pl-2 font-semibold text-[0.9375rem]"
              >
                {current ? (
                  <VaultTile vault={current} size="sm" />
                ) : (
                  <span className="grid size-7 shrink-0 place-items-center">
                    <LayersIcon className="size-4" />
                  </span>
                )}
                <span className="truncate">{name}</span>
                <ChevronsUpDownIcon className="text-muted-foreground" />
              </Button>
            )
          }
        />
        <DropdownMenuContent align={variant === "floating" ? "end" : "start"} className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={vaultFilter}
              onValueChange={(value) => setVaultFilter(value as VaultFilter)}
            >
              {/* A switch, not a setting: close once picked. */}
              <DropdownMenuRadioItem value="all" closeOnClick>
                <span className="grid size-5 place-items-center">
                  <LayersIcon className="size-4" />
                </span>
                <span className="flex-1">All vaults</span>
                <VaultCount count={total} />
              </DropdownMenuRadioItem>
              {vaults.map((vault) => (
                <DropdownMenuRadioItem key={vault.vaultId} value={vault.vaultId} closeOnClick>
                  <VaultTile vault={vault} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{vault.name}</span>
                  {vaultAccessLabel(vault) && (
                    <span className="text-muted-foreground text-xs">{vaultAccessLabel(vault)}</span>
                  )}
                  <VaultCount count={counts.get(vault.vaultId) ?? 0} />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canChangeVaults} onClick={() => setCreateOpen(true)}>
            <PlusIcon /> New vault…
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={settingsPaths.vaults} />}>
            <Settings2Icon /> Manage vaults
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VaultDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setVaultFilter} />
    </>
  );
}

function VaultCount({ count }: { count: number }) {
  return <span className="text-muted-foreground text-xs tabular-nums">{count}</span>;
}
