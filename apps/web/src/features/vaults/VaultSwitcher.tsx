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
import { useScrollCollapse } from "@repo/ui/hooks/use-scroll-collapse";
import { cn } from "@repo/ui/lib/utils";
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  LayersIcon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react";
import { useRef, useState } from "react";
import { settingsPaths } from "@/app/route-paths";
import { VaultDialog } from "./VaultDialog";
import { VaultSheet } from "./VaultSheet";
import { VaultTile } from "./VaultTile";

type VaultSwitcherProps = {
  /**
   * `scope`: the vault in view, by name, with a menu (desktop sidebar); `pill`:
   * a floating pill with tile and name opening `VaultSheet` (phone bar), which
   * shrinks to its tile as the page scrolls, making room for the list title.
   */
  variant: "scope" | "pill";
  /** `scope` on the sidebar rail: the tile only. */
  collapsed?: boolean;
  className?: string;
};

/** Pick the vault the app shows (or all of them), or create one. */
export function VaultSwitcher({ variant, collapsed = false, className }: VaultSwitcherProps) {
  const { vaults, getVault } = useVaults();
  const counts = useVaultRecordCounts();
  const { vaultFilter, setVaultFilter } = useSortedRecords();
  const { canChangeVaults } = useVaultActions();
  const [createOpen, setCreateOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  useScrollCollapse(pillRef);
  const current = vaultFilter === "all" ? undefined : getVault(vaultFilter);
  const name = current?.name ?? "All vaults";
  const total = vaults.reduce((sum, vault) => sum + (counts.get(vault.vaultId) ?? 0), 0);
  const createDialog = (
    <VaultDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setVaultFilter} />
  );

  if (variant === "pill")
    return (
      <>
        <Button
          ref={pillRef}
          variant="floating"
          size="lg"
          aria-label={`Vault: ${name}`}
          // Collapses over MobileListTitle's range, so the title arrives as the name goes.
          className="scroll-collapse min-w-0 gap-0 px-2.5 font-semibold text-[0.9375rem] [--scroll-collapse-range:4.125rem]"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
        >
          {current ? (
            <VaultTile vault={current} size="sm" />
          ) : (
            <span className="grid size-7 shrink-0 place-items-center">
              <LayersIcon className="size-4.5" />
            </span>
          )}
          <span className="flex min-w-0 max-w-[calc(11rem*(1-var(--scroll-collapse)))] items-center gap-1.5 overflow-hidden pl-[calc(0.5rem*(1-var(--scroll-collapse)))] opacity-[calc(1-var(--scroll-collapse)*1.5)]">
            <span className="truncate">{name}</span>
            <ChevronDownIcon className="text-muted-foreground" />
          </span>
        </Button>
        <VaultSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          counts={counts}
          total={total}
          onNewVault={() => setCreateOpen(true)}
        />
        {createDialog}
      </>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              aria-label={`Vault: ${name}`}
              title={collapsed ? name : undefined}
              className={cn(
                "h-10 min-w-0 gap-2.5 font-semibold text-[0.9375rem]",
                collapsed ? "w-10 px-0" : "justify-start pr-2.5 pl-1.5",
                className,
              )}
            >
              {current ? (
                <VaultTile vault={current} size="sm" />
              ) : (
                <span className="grid size-7 shrink-0 place-items-center">
                  <LayersIcon className="size-4" />
                </span>
              )}
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-left">{name}</span>
                  <ChevronsUpDownIcon className="text-muted-foreground" />
                </>
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-56">
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

      {createDialog}
    </>
  );
}

function VaultCount({ count }: { count: number }) {
  return <span className="text-muted-foreground text-xs tabular-nums">{count}</span>;
}
