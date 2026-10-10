import {
  useSortedRecords,
  useVaultActions,
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
import { ChevronDownIcon, LayersIcon, PlusIcon, Settings2Icon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { settingsPaths } from "@/app/route-paths";
import { VaultDialog } from "./VaultDialog";
import { VaultTile } from "./VaultTile";

type VaultSwitcherProps = {
  /**
   * `title`: the list's heading as the trigger (desktop list bar); `floating`:
   * a round bar button showing the vault in view (phone).
   */
  variant: "title" | "floating";
  /** The `title` trigger's text: what the list shows. */
  children?: ReactNode;
};

/** Pick the vault the list shows (or all of them), or create one. */
export function VaultSwitcher({ variant, children }: VaultSwitcherProps) {
  const { vaults, getVault } = useVaults();
  const { vaultFilter, setVaultFilter } = useSortedRecords();
  const { canChangeVaults } = useVaultActions();
  const [createOpen, setCreateOpen] = useState(false);
  const current = vaultFilter === "all" ? undefined : getVault(vaultFilter);
  const label = `Vault: ${current?.name ?? "All vaults"}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            variant === "floating" ? (
              <Button variant="floating" size="icon-xl" aria-label={label}>
                {current ? <VaultTile vault={current} size="sm" /> : <LayersIcon />}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                aria-label={label}
                className="-ml-2 h-9 gap-1.5 px-2 font-semibold text-base"
              >
                {current && <VaultTile vault={current} size="xs" />}
                {children}
                <ChevronDownIcon className="text-muted-foreground" />
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
                All vaults
              </DropdownMenuRadioItem>
              {vaults.map((vault) => (
                <DropdownMenuRadioItem key={vault.vaultId} value={vault.vaultId} closeOnClick>
                  <VaultTile vault={vault} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{vault.name}</span>
                  {vaultAccessLabel(vault) && (
                    <span className="text-muted-foreground text-xs">{vaultAccessLabel(vault)}</span>
                  )}
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
