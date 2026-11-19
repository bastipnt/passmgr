import { SORT_LABELS, type SortOption, useSortPreference } from "@repo/client";
import { AccentPicker } from "@repo/ui/complex-components/AccentPicker";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { useTheme } from "@repo/ui/providers/ThemeProvider";
import { ACCENT_HINT, ACCENT_MEANING_HINT } from "@repo/ui-shared";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { SettingsChoiceRow } from "./SettingsChoiceRow";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsRow, SettingsSegmented } from "./SettingsRow";

const THEMES = [
  { value: "system", label: "Device", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

const LANGUAGES = [{ value: "en", label: "English" }] as const;

const SORT_CHOICES = (Object.keys(SORT_LABELS) as SortOption[]).map((value) => ({
  value,
  label: SORT_LABELS[value],
}));

/** `standalone`: full width on its own, not a row's control (so it names itself). */
function ThemeSegmented({ standalone = false }: { standalone?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsSegmented
      aria-label={standalone ? "Theme" : undefined}
      className={standalone ? "w-full *:flex-1" : undefined}
      options={THEMES}
      value={theme}
      onValueChange={setTheme}
    />
  );
}

function ListsAndLanguage() {
  const [sort, setSort] = useSortPreference();
  return (
    <SettingsGroup label="Lists and language">
      <SettingsChoiceRow
        label="Default sort order"
        hint="How items are ordered when you open the vault."
        choices={SORT_CHOICES}
        value={sort}
        onValueChange={setSort}
      />
      <SettingsChoiceRow
        label="Language"
        hint="More languages are coming."
        phoneHint="More languages are coming"
        choices={LANGUAGES}
        value="en"
        onValueChange={() => undefined}
        disabled
      />
    </SettingsGroup>
  );
}

export default function AppearanceSettingsPage() {
  const isMobile = useIsMobile();

  return (
    <SettingsPage
      title="Appearance"
      description="How the app looks and how your items are listed on this device."
    >
      {isMobile ? (
        <>
          <SettingsGroup label="Theme" cardless>
            <ThemeSegmented standalone />
          </SettingsGroup>
          <SettingsGroup label="Accent" footnote={ACCENT_MEANING_HINT}>
            <AccentPicker className="p-4" />
          </SettingsGroup>
        </>
      ) : (
        <SettingsGroup label="Look">
          <SettingsRow
            label="Theme"
            hint="Device follows your system setting."
            control={<ThemeSegmented />}
          />
          <div className="flex flex-col pb-4">
            <SettingsRow label="Accent" hint={ACCENT_HINT} />
            <AccentPicker className="px-5" />
          </div>
        </SettingsGroup>
      )}
      <ListsAndLanguage />
    </SettingsPage>
  );
}
