import { type VaultIcon, type VaultInfo, vaultHue, vaultIcon } from "@repo/client";
import type { VaultMeta } from "@repo/schema";
import { hueTint } from "@repo/ui/lib/hue-tint";
import { cn } from "@repo/ui/lib/utils";
import {
  BriefcaseIcon,
  CodeIcon,
  Gamepad2Icon,
  HeartIcon,
  HouseIcon,
  type LucideIcon,
  PlaneIcon,
  StarIcon,
  UsersIcon,
  VaultIcon as VaultDoorIcon,
  WalletIcon,
} from "lucide-react";

export const VAULT_ICON_COMPONENTS: Record<VaultIcon, LucideIcon> = {
  vault: VaultDoorIcon,
  briefcase: BriefcaseIcon,
  home: HouseIcon,
  users: UsersIcon,
  heart: HeartIcon,
  star: StarIcon,
  code: CodeIcon,
  wallet: WalletIcon,
  plane: PlaneIcon,
  gamepad: Gamepad2Icon,
};

const SIZES = {
  xs: { tile: "size-5 rounded-md", icon: "size-3" },
  sm: { tile: "size-7 rounded-lg", icon: "size-4" },
  default: { tile: "size-9 rounded-[10px]", icon: "size-[1.125rem]" },
} as const;

type VaultTileProps = {
  vault: Pick<VaultMeta, "icon" | "color">;
  size?: keyof typeof SIZES;
  className?: string;
};

/** The vault's icon on a tile tinted with its colour. */
export function VaultTile({ vault, size = "default", className }: VaultTileProps) {
  const Icon = VAULT_ICON_COMPONENTS[vaultIcon(vault)];
  return (
    <span
      style={hueTint(vaultHue(vault))}
      className={cn("grid shrink-0 place-items-center", SIZES[size].tile, className)}
      aria-hidden
    >
      <Icon className={SIZES[size].icon} />
    </span>
  );
}

/**
 * The vault's initial on a small solid tile in its colour, for a corner of a
 * record's avatar. Ringed in `--vault-mark-ring` (default: the list's fill),
 * which a row sets to its own background.
 */
export function VaultMark({ vault, className }: { vault: VaultInfo; className?: string }) {
  return (
    <span
      title={vault.name}
      style={{ backgroundColor: `oklch(0.58 0.15 ${vaultHue(vault)})` }}
      className={cn(
        "grid size-4 place-items-center rounded-[5px] font-bold text-[0.5625rem] text-white leading-none ring-(--vault-mark-ring,var(--sticky-bar-fill)) ring-2",
        className,
      )}
    >
      <span aria-hidden>{vault.name.charAt(0).toUpperCase()}</span>
      <span className="sr-only">In {vault.name}</span>
    </span>
  );
}

/** The vault's name after a small tile, inline. */
export function VaultBadge({ vault, className }: { vault: VaultInfo; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <VaultTile vault={vault} size="xs" />
      <span className="truncate">{vault.name}</span>
    </span>
  );
}
