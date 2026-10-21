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

/** The vault's name after a small tile, inline (a record's vault in "All vaults"). */
export function VaultBadge({ vault, className }: { vault: VaultInfo; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <VaultTile vault={vault} size="xs" />
      <span className="truncate">{vault.name}</span>
    </span>
  );
}
