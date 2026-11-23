import { useStore } from "@repo/client";
import {
  comboboxInputProps,
  Listbox,
  ListboxGroup,
  ListboxOption,
} from "@repo/ui/components/Combobox";
import { cn } from "@repo/ui/lib/utils";
import { SearchXIcon } from "lucide-react";
import { createContext, type ReactNode, use, useEffect, useId, useRef, useState } from "react";
import { useLocation } from "wouter";
import { historyState } from "@/lib/history-state";
import { groupCardClassName, groupLabelClassName } from "./SettingsGroup";
import { SettingsSearchField } from "./SettingsSearchField";
import {
  matchSettings,
  revealSetting,
  type SettingMatch,
  settingsIndexFor,
} from "./settings-search";
import { useSettingsGroups } from "./settings-sections";

type SettingsSearchState = {
  query: string;
  setQuery: (query: string) => void;
  results: ReturnType<typeof matchSettings>;
  matches: SettingMatch[];
  active: number;
  setActive: (index: number) => void;
  open: (match: SettingMatch) => void;
  listId: string;
};

const SettingsSearchContext = createContext<SettingsSearchState | null>(null);

function useSettingsSearch() {
  const search = use(SettingsSearchContext);
  if (!search) throw new Error("useSettingsSearch needs a SettingsSearchProvider");
  return search;
}

/** Whether a query is typed: the page gives way to the results. */
export function useSettingsSearchActive() {
  return useSettingsSearch().query.trim() !== "";
}

function historyQuery(): string {
  const query = historyState()?.settingsSearch;
  return typeof query === "string" ? query : "";
}

/**
 * The phone's query lives in a history entry over the list, so Back clears it,
 * and Back from a result's page brings the results back.
 */
function usePhoneHistoryQuery(phone: boolean): [string, (query: string) => void] {
  const [query, setQueryState] = useState(() => (phone ? historyQuery() : ""));
  const latest = useRef(query);
  // Set while the Back that drops an emptied search's entry is on its way.
  const leaving = useRef(false);

  useEffect(() => {
    if (!phone) return;
    const onPop = () => {
      if (!leaving.current) {
        latest.current = historyQuery();
        setQueryState(latest.current);
        return;
      }
      leaving.current = false;
      // Typed again before the Back landed: the search needs its entry back.
      if (latest.current) history.pushState({ settingsSearch: latest.current }, "");
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [phone]);

  const setQuery = (next: string) => {
    latest.current = next;
    setQueryState(next);
    if (!phone || leaving.current) return;
    const state = historyState();
    if (state && "settingsSearch" in state) {
      if (next) history.replaceState({ ...state, settingsSearch: next }, "");
      else {
        leaving.current = true;
        history.back();
      }
    } else if (next) history.pushState({ settingsSearch: next }, "");
  };
  return [query, setQuery];
}

/** Settings search: the field (desktop header, phone list) and the results share this. */
export function SettingsSearchProvider({
  phone,
  children,
}: {
  phone: boolean;
  children: ReactNode;
}) {
  const [location, navigate] = useLocation();
  const [query, setQuery] = usePhoneHistoryQuery(phone);
  const [active, setActive] = useState(0);
  const linked = useStore().profile?.mode === "linked";
  const sections = useSettingsGroups({ phone }).flatMap((group) => group.sections);
  const results = matchSettings(query, sections, settingsIndexFor(linked));
  const listId = useId();
  const cancelReveal = useRef<() => void>(undefined);

  useEffect(() => () => cancelReveal.current?.(), []);
  // Desktop: going to a page by the nav leaves the search.
  const [shownLocation, setShownLocation] = useState(location);
  if (shownLocation !== location) {
    setShownLocation(location);
    if (!phone) setQuery("");
  }
  const [activeFor, setActiveFor] = useState(query);
  if (activeFor !== query) {
    setActiveFor(query);
    setActive(0);
  }

  const state: SettingsSearchState = {
    query,
    setQuery,
    results,
    matches: results.flatMap((group) => group.matches),
    active,
    setActive,
    open: (match) => {
      cancelReveal.current?.();
      if (match.path !== location) navigate(match.path);
      if (!phone) setQuery("");
      cancelReveal.current = revealSetting(match.path, match);
    },
    listId,
  };
  return <SettingsSearchContext value={state}>{children}</SettingsSearchContext>;
}

/**
 * The search field, a combobox over the results: ↑ / ↓ pick, Enter opens, Esc
 * clears the query, or with none calls `onEscape` (closes the overlay).
 */
export function SettingsSearchBox({
  className,
  inputRef,
  onEscape,
}: {
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onEscape?: () => void;
}) {
  const { query, setQuery, matches, active, setActive, open, listId } = useSettingsSearch();
  const searching = query.trim() !== "";

  return (
    <SettingsSearchField
      className={className}
      value={query}
      onValueChange={setQuery}
      inputProps={{
        ref: inputRef,
        ...comboboxInputProps({
          listboxId: listId,
          open: searching,
          count: matches.length,
          activeIndex: matches[active] ? active : -1,
          onActiveIndexChange: setActive,
          wrap: true,
          onSelect: (index) => {
            const match = matches[index];
            if (match) open(match);
          },
          onEscape: (event) => {
            event.preventDefault();
            if (query) setQuery("");
            else onEscape?.();
          },
        }),
      }}
    />
  );
}

/** What a query found, grouped by section; replaces the page (desktop) or the list (phone). */
export function SettingsSearchResults({ className }: { className?: string }) {
  const { query, results, active, setActive, open, listId } = useSettingsSearch();
  const headingId = useId();

  if (results.length === 0)
    return (
      <div
        // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- a live region, not a form's output
        role="status"
        className={cn("flex flex-col items-center gap-2 py-16 text-center", className)}
      >
        <SearchXIcon aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="font-medium">No settings match “{query.trim()}”</p>
        <p className="text-muted-foreground text-sm">Try another word, like “lock” or “export”.</p>
      </div>
    );

  let index = 0;
  return (
    <Listbox
      id={listId}
      aria-label="Matching settings"
      className={cn("flex flex-col gap-7", className)}
    >
      {results.map(({ section, matches }, groupIndex) => {
        const Icon = section.icon;
        return (
          <ListboxGroup
            key={section.path}
            aria-labelledby={`${headingId}-${groupIndex}`}
            className="flex flex-col gap-2"
          >
            <div
              id={`${headingId}-${groupIndex}`}
              className={cn(groupLabelClassName, "flex items-center gap-2")}
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {section.label}
            </div>
            <div className={groupCardClassName}>
              {matches.map((match) => {
                const position = index++;
                const selected = position === active;
                const isSection = match.key === section.path;
                return (
                  <ListboxOption
                    key={match.key}
                    index={position}
                    selected={selected}
                    onPointerMove={() => setActive(position)}
                    onClick={() => open(match)}
                    className={cn(
                      "flex min-h-13 cursor-pointer items-center gap-1.5 px-5 py-3 text-sm max-sm:min-h-14 max-sm:px-4.5 max-sm:text-base",
                      selected && "bg-foreground/5",
                    )}
                  >
                    {isSection ? (
                      <span className="font-medium">{section.label}</span>
                    ) : (
                      <>
                        <span className="text-muted-foreground">{section.label} ›</span>{" "}
                        <span className="font-medium">{match.label}</span>
                      </>
                    )}
                  </ListboxOption>
                );
              })}
            </div>
          </ListboxGroup>
        );
      })}
    </Listbox>
  );
}
