import {
  SORT_LABELS,
  type SortOption,
  useSortPreference,
  useWebsiteIconsPreference,
} from "@repo/client";
import { AccentPicker } from "@repo/ui/complex-components/AccentPicker";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/Item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";
import { Switch } from "@repo/ui/components/Switch";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/ToggleGroup";
import { useTheme } from "@repo/ui/providers/ThemeProvider";
import { ACCENT_HINT, WEBSITE_ICONS_HINT } from "@repo/ui-shared";
import { Monitor, Moon, Sun } from "lucide-react";
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

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();
  const [sort, setSort] = useSortPreference();
  const [websiteIcons, setWebsiteIcons] = useWebsiteIconsPreference();

  return (
    <>
      <PanelHeader>
        <PanelTitle>Appearance</PanelTitle>
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
                <ItemDescription>{ACCENT_HINT}</ItemDescription>
              </ItemContent>
            </Item>

            <Item variant="outline">
              <ItemContent>
                <ItemTitle id="website-icons-label">Show website icons</ItemTitle>
                <ItemDescription>{WEBSITE_ICONS_HINT}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Switch
                  aria-labelledby="website-icons-label"
                  checked={websiteIcons}
                  onCheckedChange={setWebsiteIcons}
                />
              </ItemActions>
            </Item>
          </ItemGroup>
        </section>
        <ItemGroup>
          <Item variant="outline">
            <ItemContent className="gap-2">
              <ItemTitle id="language-label">Language (coming soon)</ItemTitle>
              <Select items={languages} defaultValue={languages[0].value} disabled>
                <SelectTrigger className="w-full" aria-labelledby="language-label">
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
              <ItemTitle id="sort-label">Default sort order</ItemTitle>
              <Select
                items={sortOptions}
                value={sort}
                onValueChange={(value) => setSort(value as SortOption)}
              >
                <SelectTrigger className="w-full" aria-labelledby="sort-label">
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
        </ItemGroup>
      </div>
    </>
  );
}
