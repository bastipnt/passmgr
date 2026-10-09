import { getRecordWebsites, RECORD_TYPE_HUES } from "@repo/client";
import type { RecordData, RecordType } from "@repo/schema";
import { IconTile, WebsiteAvatar } from "@repo/ui-native";
import {
  Braces,
  CreditCard,
  IdCard,
  KeyRound,
  type LucideIcon,
  NotebookText,
  SquareTerminal,
  Wifi,
} from "lucide-react-native";

/** Web's `RECORD_TYPE_ICONS`. */
export const RECORD_TYPE_ICONS: Record<RecordType, LucideIcon> = {
  login: KeyRound,
  card: CreditCard,
  identity: IdCard,
  note: NotebookText,
  ssh_key: SquareTerminal,
  api_key: Braces,
  wifi: Wifi,
};

const ICON_SIZES = { default: 18, md: 20, lg: 28 } as const;

type Size = keyof typeof ICON_SIZES;

// TODO: move to component library
/** The type's icon on a tile tinted with its hue. */
export function RecordTypeTile({ type, size = "default" }: { type: RecordType; size?: Size }) {
  const Icon = RECORD_TYPE_ICONS[type];
  return (
    <IconTile
      hue={RECORD_TYPE_HUES[type]}
      size={size}
      icon={(color) => <Icon size={ICON_SIZES[size]} color={color} />}
    />
  );
}

/** A login's site icon (or initial); every other type shows its type icon. */
export function RecordAvatar({ record, size = "default" }: { record: RecordData; size?: Size }) {
  if (record.type === "login") {
    return <WebsiteAvatar title={record.title} websites={getRecordWebsites(record)} size={size} />;
  }
  return <RecordTypeTile type={record.type} size={size} />;
}
