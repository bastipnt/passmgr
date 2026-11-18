import { Kbd, KbdGroup } from "@repo/ui/components/Kbd";
import { formatShortcut, modKey } from "@/lib/formatShortcut";
import { SHORTCUT_GROUPS, SHORTCUTS } from "@/lib/shortcuts";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsRow } from "./SettingsRow";

const shortcuts = Object.values(SHORTCUTS);

/** Every shortcut, from the same list the `?` dialog reads (desktop only). */
export default function ShortcutsSettingsPage() {
  return (
    <SettingsPage
      title="Keyboard shortcuts"
      description={
        <>
          Press <Kbd>?</Kbd> anywhere in the vault to see this list.
          {modKey === "⌘" && " On Windows and Linux, use Ctrl instead of ⌘."}
        </>
      }
    >
      {SHORTCUT_GROUPS.map(({ group, label }) => (
        <SettingsGroup key={group} label={label} list>
          {shortcuts
            .filter((shortcut) => shortcut.group === group)
            .map((shortcut) => (
              <li key={shortcut.key}>
                <SettingsRow
                  label={shortcut.description}
                  control={
                    <KbdGroup>
                      {formatShortcut(shortcut.key).map((token) => (
                        <Kbd key={token}>{token}</Kbd>
                      ))}
                    </KbdGroup>
                  }
                />
              </li>
            ))}
        </SettingsGroup>
      ))}
    </SettingsPage>
  );
}
