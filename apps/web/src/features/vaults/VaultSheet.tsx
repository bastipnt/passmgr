import {
  useSortedRecords,
  useVaultActions,
  useVaults,
  type VaultFilter,
  vaultAccessLabel,
} from "@repo/client";
import { ResponsiveSheet, SheetDrawerHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import Link from "@repo/ui/components/Link";
import { ListRow, ListRowIcon } from "@repo/ui/components/ListRow";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { counted } from "@repo/util";
import { CheckIcon, LayersIcon, PlusIcon } from "lucide-react";
import { useRef } from "react";
import { settingsPaths } from "@/app/route-paths";
import { VaultTile } from "./VaultTile";

const TITLE = "Vaults";

type VaultSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: ReadonlyMap<string, number>;
  total: number;
  /** Called once the sheet has closed, so the create dialog doesn't open under it. */
  onNewVault: () => void;
};

/** The phone's vault switcher: pick the vault in view (or all of them), or create one. */
export function VaultSheet({ open, onOpenChange, counts, total, onNewVault }: VaultSheetProps) {
  const creating = useRef(false);
  const { vaults } = useVaults();
  const { vaultFilter, setVaultFilter } = useSortedRecords();
  const { canChangeVaults } = useVaultActions();
  const isMobile = useIsMobile();
  const pick = (filter: VaultFilter) => {
    setVaultFilter(filter);
    onOpenChange(false);
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen || !creating.current) return;
        creating.current = false;
        onNewVault();
      }}
      title={TITLE}
      actions={
        <div className="flex items-center gap-2">
          {isMobile && <SheetDrawerHeader title={TITLE} />}
          <Link
            variant="ghost"
            size="lg"
            href={settingsPaths.vaults}
            onClick={() => onOpenChange(false)}
            className="ml-auto text-primary-text"
          >
            Manage
          </Link>
        </div>
      }
    >
      <div className="flex flex-col">
        <ListRow
          media={
            <ListRowIcon>
              <LayersIcon />
            </ListRowIcon>
          }
          title="All vaults"
          description={counted(total, "item", "items")}
          active={vaultFilter === "all"}
          aria-pressed={vaultFilter === "all"}
          trailing={vaultFilter === "all" && <SelectedMark />}
          onClick={() => pick("all")}
        />
        {vaults.map((vault) => {
          const selected = vault.vaultId === vaultFilter;
          const access = vaultAccessLabel(vault);
          const items = counted(counts.get(vault.vaultId) ?? 0, "item", "items");
          return (
            <ListRow
              key={vault.vaultId}
              media={<VaultTile vault={vault} />}
              title={vault.name}
              description={access ? `${items} · ${access}` : items}
              active={selected}
              aria-pressed={selected}
              trailing={selected && <SelectedMark />}
              onClick={() => pick(vault.vaultId)}
            />
          );
        })}
        <hr className="my-1 border-foreground/10 dark:border-white/10" />
        <ListRow
          media={
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/40 border-dashed text-primary-text">
              <PlusIcon aria-hidden className="size-4.5" />
            </span>
          }
          title={<span className="text-primary-text">New vault</span>}
          disabled={!canChangeVaults}
          onClick={() => {
            creating.current = true;
            onOpenChange(false);
          }}
        />
      </div>
    </ResponsiveSheet>
  );
}

function SelectedMark() {
  return <CheckIcon aria-hidden className="size-5 shrink-0 text-primary-text" />;
}
