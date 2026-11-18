import { SessionActions } from "./SessionActions";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsRow } from "./SettingsRow";
import { SettingsSearchField } from "./SettingsSearchField";
import { useSectionDetails, useSettingsGroups } from "./settings-sections";

/** The phone's `/settings`: every section as a drill-down row, grouped. */
export default function SettingsHome() {
  const details = useSectionDetails();
  const groups = useSettingsGroups({ phone: true });

  return (
    <SettingsPage title="Settings">
      <SettingsSearchField />
      {groups.map((group) => (
        <SettingsGroup key={group.label} label={group.label}>
          {group.sections.map((section) => (
            <SettingsRow
              key={section.path}
              icon={section.icon}
              label={section.label}
              hint={details[section.path]?.hint}
              value={details[section.path]?.value}
              href={section.path}
            />
          ))}
        </SettingsGroup>
      ))}
      <SessionActions />
    </SettingsPage>
  );
}
