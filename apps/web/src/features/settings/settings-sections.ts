import {
  AUTO_LOCK_PREFERENCE,
  profileLabel,
  useChoicePreference,
  useStore,
  useSyncSummary,
  useTags,
  useVaults,
} from "@repo/client";
import { useTheme } from "@repo/ui/providers/ThemeProvider";
import { ACCENT_LABELS } from "@repo/ui-shared";
import {
  ArchiveIcon,
  CircleUserRoundIcon,
  HardDriveDownloadIcon,
  KeyboardIcon,
  LockIcon,
  type LucideIcon,
  MonitorSmartphoneIcon,
  PaletteIcon,
  RefreshCwIcon,
  TagIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { settingsPaths } from "@/app/route-paths";

export type SettingsSection = {
  path: string;
  label: string;
  icon: LucideIcon;
  desktopOnly?: boolean;
  /** Only an online account has it (signed-in devices, activity). */
  linkedOnly?: boolean;
};

export const SETTINGS_GROUPS: readonly { label: string; sections: readonly SettingsSection[] }[] = [
  {
    label: "Account",
    sections: [
      { path: settingsPaths.account, label: "Account", icon: CircleUserRoundIcon },
      {
        path: settingsPaths.devices,
        label: "Devices & activity",
        icon: MonitorSmartphoneIcon,
        linkedOnly: true,
      },
      { path: settingsPaths.sync, label: "Sync & storage", icon: RefreshCwIcon },
    ],
  },
  {
    label: "Vault",
    sections: [
      { path: settingsPaths.vaults, label: "Vaults", icon: ArchiveIcon },
      { path: settingsPaths.tags, label: "Tags", icon: TagIcon },
      { path: settingsPaths.trash, label: "Trash", icon: Trash2Icon },
      { path: settingsPaths.backup, label: "Import & export", icon: HardDriveDownloadIcon },
    ],
  },
  {
    label: "App",
    sections: [
      { path: settingsPaths.security, label: "Security", icon: LockIcon },
      { path: settingsPaths.appearance, label: "Appearance", icon: PaletteIcon },
      { path: settingsPaths.generator, label: "Password generator", icon: WandSparklesIcon },
      {
        path: settingsPaths.shortcuts,
        label: "Keyboard shortcuts",
        icon: KeyboardIcon,
        desktopOnly: true,
      },
    ],
  },
];

/** The groups with the sections this vault and screen have. */
export function useSettingsGroups({ phone }: { phone: boolean }) {
  const linked = useStore().profile?.mode === "linked";
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter(
      (section) => !(phone && section.desktopOnly) && !(section.linkedOnly && !linked),
    ),
  }));
}

export type SectionDetail = {
  /** A tally after the label (the desktop nav). */
  count?: number;
  /** The current setting, at the end of the phone's row. */
  value?: string;
  /** Under the label on the phone (the account's email). */
  hint?: string;
  synced?: boolean;
};

/** What the section list shows about each section, by path. */
export function useSectionDetails(): Partial<Record<string, SectionDetail>> {
  const { active } = useStore();
  const { summary } = useSyncSummary();
  const { vaults } = useVaults();
  const tags = useTags();
  const [autoLock] = useChoicePreference(AUTO_LOCK_PREFERENCE);
  const { accent } = useTheme();
  const autoLockLabel = AUTO_LOCK_PREFERENCE.choices.find((c) => c.value === autoLock)?.label;

  return {
    [settingsPaths.account]: { hint: active ? profileLabel(active.entry) : undefined },
    [settingsPaths.sync]: { value: summary.title, synced: summary.state === "synced" },
    [settingsPaths.vaults]: { count: vaults.length, value: String(vaults.length) },
    [settingsPaths.tags]: { count: tags.length, value: String(tags.length) },
    [settingsPaths.security]: { value: autoLockLabel?.replace(/^After /, "") },
    [settingsPaths.appearance]: { value: ACCENT_LABELS[accent] },
  };
}
