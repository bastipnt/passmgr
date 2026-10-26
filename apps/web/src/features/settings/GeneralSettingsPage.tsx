import { DEFAULT_SORT, PREF_KEYS, SORT_LABELS, type SortOption, usePreference } from "@repo/client";
import { AccentPicker } from "@repo/ui/complex-components/AccentPicker";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Kbd } from "@repo/ui/components/Kbd";
import Link from "@repo/ui/components/Link";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ToggleGroup";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { useTheme } from "@repo/ui/providers/ThemeProvider";
import { Monitor, Moon, Sun } from "lucide-react";
import { recordPaths } from "@/app/route-paths";
import { PanelHeader, PanelTitle } from "@/components/AppShell";

const themes = [
  { label: "Device", value: "system", icon: Monitor },
  { label: "Light", value: "light", icon: Sun },
  { label: "Dark", value: "dark", icon: Moon },
] as const;

type ThemeValue = (typeof themes)[number]["value"];

const languages = [
  { label: "English", value: "en" },
  { label: "German", value: "de" },
] as const;

const sortOptions = (Object.keys(SORT_LABELS) as SortOption[]).map((value) => ({
  label: SORT_LABELS[value],
  value,
}));

export default function GeneralSettingsPage() {
  const { theme, setTheme } = useTheme();
  const [sort, setSort] = usePreference<SortOption>(PREF_KEYS.sort, DEFAULT_SORT);
  const isMobile = useIsMobile();

  return (
    <>
      <PanelHeader>
        <PanelTitle>General Settings</PanelTitle>
      </PanelHeader>
      <div className="px-4 pb-4">
        <section aria-labelledby="appearance-heading" className="mb-6">
          <h2 id="appearance-heading" className="mb-2 font-medium text-muted-foreground text-sm">
            Appearance
          </h2>
          <ItemGroup>
            <Item variant="outline">
              <ItemContent className="gap-2">
                <ItemTitle id="theme-label">Theme</ItemTitle>
                <ToggleGroup
                  aria-labelledby="theme-label"
                  className="w-full"
                  value={[theme]}
                  onValueChange={(value) => {
                    const next = value[0] as ThemeValue | undefined;
                    if (next) setTheme(next);
                  }}
                >
                  {themes.map(({ label, value, icon: Icon }) => (
                    <ToggleGroupItem key={value} value={value} aria-label={label}>
                      <Icon />
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </ItemContent>
            </Item>

            <Item variant="outline">
              <ItemContent className="gap-2">
                <ItemTitle>Accent</ItemTitle>
                <AccentPicker />
                <ItemDescription>
                  Logo, buttons, selection and links use the accent. Green, amber and red keep their
                  meaning in every option.
                </ItemDescription>
              </ItemContent>
            </Item>
          </ItemGroup>
        </section>
        <ItemGroup>
          <Item variant="outline">
            <ItemContent className="gap-2">
              <ItemTitle>Language (coming soon)</ItemTitle>
              <Select items={languages} defaultValue={languages[0].value} disabled>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Language</SelectLabel>
                    {languages.map((language) => (
                      <SelectItem key={language.value} value={language.value}>
                        {language.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </ItemContent>
          </Item>

          <Item variant="outline">
            <ItemContent className="gap-2">
              <ItemTitle>Default sort order</ItemTitle>
              <Select
                items={sortOptions}
                value={sort}
                onValueChange={(value) => setSort(value as SortOption)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Sort records by</SelectLabel>
                    {sortOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </ItemContent>
          </Item>

          {!isMobile && (
            <Item variant="outline">
              <ItemContent>
                <ItemTitle>Keyboard shortcuts</ItemTitle>
                <ItemDescription>
                  Press <Kbd>?</Kbd> in your vault to list them.
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Link variant="outline" size="sm" href={recordPaths.shortcuts}>
                  Show
                </Link>
              </ItemActions>
            </Item>
          )}
        </ItemGroup>
      </div>
    </>
  );
}
