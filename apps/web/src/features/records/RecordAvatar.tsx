import { getRecordWebsites, RECORD_TYPE_HUES } from "@repo/client";
import type { RecordData, RecordType } from "@repo/schema";
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
import type { CSSProperties } from "react";
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
  lg: { tile: "size-14 rounded-2xl", icon: "size-7" },
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
  const hue = RECORD_TYPE_HUES[type];
  const style: CSSProperties = {
    backgroundColor: `oklch(var(--avatar-fallback-l-bg) var(--avatar-fallback-c-bg) ${hue})`,
    color: `oklch(var(--avatar-fallback-l-fg) var(--avatar-fallback-c-fg) ${hue})`,
  };

  return (
    <span
      style={style}
      className={cn("grid shrink-0 place-items-center", SIZES[size].tile, className)}
      aria-hidden
    >
      <Icon className={SIZES[size].icon} />
    </span>
  );
}

type RecordAvatarProps = {
  record: RecordData;
  size?: keyof typeof SIZES;
};

/** A login's site icon (or initial); every other type shows its type icon. */
export function RecordAvatar({ record, size = "default" }: RecordAvatarProps) {
  if (record.type === "login") {
    return <WebsiteAvatar title={record.title} websites={getRecordWebsites(record)} size={size} />;
  }
  return <RecordTypeTile type={record.type} size={size} />;
}
