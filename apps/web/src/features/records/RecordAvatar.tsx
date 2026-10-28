import { getRecordWebsites, RECORD_TYPE_HUES, type VaultInfo } from "@repo/client";
import type { RecordData, RecordType } from "@repo/schema";
import { hueTint } from "@repo/ui/lib/hue-tint";
import { cn } from "@repo/ui/lib/utils";
import {
  BracesIcon,
  CreditCardIcon,
  IdCardIcon,
  KeyRoundIcon,
  type LucideIcon,
  NotebookTextIcon,
  SquareTerminalIcon,
  WifiIcon,
} from "lucide-react";
import { VaultMark } from "@/features/vaults";
import { WebsiteAvatar } from "./WebsiteAvatar";

export const RECORD_TYPE_ICONS: Record<RecordType, LucideIcon> = {
  login: KeyRoundIcon,
  card: CreditCardIcon,
  identity: IdCardIcon,
  note: NotebookTextIcon,
  ssh_key: SquareTerminalIcon,
  api_key: BracesIcon,
  wifi: WifiIcon,
};

const SIZES = {
  default: { tile: "size-9 rounded-[10px]", icon: "size-[1.125rem]" },
  md: { tile: "size-[2.625rem] rounded-xl", icon: "size-5" },
  ml: { tile: "size-12 rounded-[13px]", icon: "size-6" },
  header: { tile: "size-13 rounded-[14px]", icon: "size-[1.625rem]" },
  lg: { tile: "size-14 rounded-2xl", icon: "size-7" },
  xl: { tile: "size-16 rounded-[1.125rem]", icon: "size-8" },
} as const;

type RecordTypeTileProps = {
  type: RecordType;
  size?: keyof typeof SIZES;
  className?: string;
};

// TODO: move to ui

/** The type's icon on a tile tinted with its hue (the avatar's fallback colours). */
export function RecordTypeTile({ type, size = "default", className }: RecordTypeTileProps) {
  const Icon = RECORD_TYPE_ICONS[type];

  return (
    <span
      style={hueTint(RECORD_TYPE_HUES[type])}
      className={cn("grid shrink-0 place-items-center", SIZES[size].tile, className)}
      aria-hidden
    >
      <Icon className={SIZES[size].icon} />
    </span>
  );
}

type RecordAvatarProps = {
  record: RecordData;
  className?: string;
  size?: keyof typeof SIZES;
  /** Marked in the bottom-right corner (a list mixing several vaults). */
  vault?: VaultInfo;
};

/** A login's site icon (or initial); every other type shows its type icon. */
export function RecordAvatar({ record, className, size = "default", vault }: RecordAvatarProps) {
  const avatar =
    record.type === "login" ? (
      <WebsiteAvatar
        title={record.title}
        websites={getRecordWebsites(record)}
        size={size}
        className={className}
      />
    ) : (
      <RecordTypeTile type={record.type} size={size} className={className} />
    );
  if (!vault) return avatar;
  return (
    <span className="relative flex shrink-0">
      {avatar}
      <VaultMark vault={vault} className="absolute -right-1 -bottom-1" />
    </span>
  );
}
