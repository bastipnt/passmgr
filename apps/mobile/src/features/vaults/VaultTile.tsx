import { type VaultIcon, vaultHue, vaultIcon } from "@repo/client";
import type { VaultMeta } from "@repo/schema";
import { IconTile } from "@repo/ui-native";
import {
  Briefcase,
  Code,
  Gamepad2,
  Heart,
  House,
  type LucideIcon,
  Plane,
  Star,
  Users,
  Vault,
  Wallet,
} from "lucide-react-native";

/** Web's `VAULT_ICON_COMPONENTS`. */
export const VAULT_ICON_COMPONENTS: Record<VaultIcon, LucideIcon> = {
  vault: Vault,
  briefcase: Briefcase,
  home: House,
  users: Users,
  heart: Heart,
  star: Star,
  code: Code,
  wallet: Wallet,
  plane: Plane,
  gamepad: Gamepad2,
};

const ICON_SIZES = { default: 18, md: 20, lg: 28 } as const;

// TODO: move to ui-mobile

/** The vault's icon on a tile tinted with its colour (web's `VaultTile`). */
export function VaultTile({
  vault,
  size = "default",
}: {
  vault: Pick<VaultMeta, "icon" | "color">;
  size?: keyof typeof ICON_SIZES;
}) {
  const Icon = VAULT_ICON_COMPONENTS[vaultIcon(vault)];
  return (
    <IconTile
      hue={vaultHue(vault)}
      size={size}
      icon={(color) => <Icon size={ICON_SIZES[size]} color={color} />}
    />
  );
}
