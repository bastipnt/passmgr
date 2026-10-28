import {
  type PillTag,
  pillTags,
  type RecentSearch,
  recentSearchKey,
  type SearchOption,
  TAG_SEARCH_PREFIX,
  useSearchOptions,
} from "@repo/client";
import { useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { Button } from "@repo/ui/components/Button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/InputGroup";
import { TagPill } from "@repo/ui/components/TagPill";
import { useBlurOnDrag } from "@repo/ui/hooks/use-blur-on-drag";
import { useKeyboardInset } from "@repo/ui/hooks/use-keyboard-inset";
import { useMediaQuery } from "@repo/ui/hooks/use-media-query";
import { handOffKeyboard, releaseKeyboard } from "@repo/ui/lib/keyboard-handoff";
import { restoreScroll } from "@repo/ui/lib/restore-scroll";
import { cn } from "@repo/ui/lib/utils";
import { counted } from "@repo/util";
import { HistoryIcon, PlusIcon, SearchIcon, TagIcon, XIcon } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { NoSearchResults } from "./NoSearchResults";
import { OutsideScope } from "./OutsideScope";
import { RecordOptionRow, SearchScope, TagRow } from "./SearchPanel";
import {
  currentSearchEntry,
  OPENED_FROM_SEARCH,
  pushSearchEntry,
  type SearchEntry,
  saveResultsScroll,
  takeResultsScroll,
} from "./search-history";

const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/**
 * Phones in landscape: with the keyboard up, the scope row and pill bar would
 * leave the results no room. By the layout, not the keyboard, so dropping the
 * keyboard mid-drag doesn't shift the list.
 */
const SHORT_QUERY = "(max-height: 499px)";

/**
 * The phone search's open state. It lives in a history entry over the vault
 * list: Back closes it, and Back from a record opened from it reopens it with
 * the same query. Closing it (Cancel or Back) clears the query and puts the
 * filters (tags, category) and the list's scroll back the way they were when it opened.
 */
export function useMobileSearch() {
  const { query, tagFilters, categoryFilter, setQuery, setTags, setCategoryFilter } =
    useSortedRecords();
  const [entry, setEntry] = useState(currentSearchEntry);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const filtersNow = useRef({ tagFilters, categoryFilter });
  filtersNow.current = { tagFilters, categoryFilter };

  const reset = useCallback(
    ({ tagsBefore, categoryBefore, scrollY }: SearchEntry) => {
      setQuery("");
      setCategoryFilter(categoryBefore);
      // The list behind filtered along with the search; once it's whole again.
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
      setTags(tagsBefore);
    },
    [setQuery, setTags, setCategoryFilter],
  );

  // A query left over from elsewhere (the desktop search before a resize, or a
  // search left by a link) would filter the list with nothing on screen saying so.
  const leftoverQuery = useRef(!entry && query !== "");
  useEffect(() => {
    if (leftoverQuery.current) setQuery("");
  }, [setQuery]);

  // Back from a record opened in the search: carry on typing. `MobileRecordPage`
  // holds the keyboard in its Back tap; elsewhere (swipe, system Back) focus alone.
  // Landing on the plain list instead, a held keyboard has nowhere to go.
  useEffect(() => {
    const entry = entryRef.current;
    if (!entry) {
      releaseKeyboard();
      return;
    }
    if (!handOffKeyboard(inputRef.current)) inputRef.current?.focus({ preventScroll: true });
    const top = takeResultsScroll();
    if (top > 0 && resultsRef.current) return restoreScroll(resultsRef.current, top);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = currentSearchEntry();
      if (entryRef.current && !next) reset(entryRef.current);
      setEntry(next);
    };
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, [reset]);

  // iOS only raises the keyboard for a focus() inside the tap itself, so the
  // overlay is always mounted and made focusable synchronously here.
  const openSearch = useCallback(() => {
    const { tagFilters, categoryFilter } = filtersNow.current;
    const next = {
      tagsBefore: [...tagFilters],
      categoryBefore: categoryFilter,
      scrollY: window.scrollY,
    };
    flushSync(() => setEntry(next));
    inputRef.current?.focus();
    pushSearchEntry(next);
  }, []);

  const closeSearch = useCallback(() => {
    if (currentSearchEntry()) history.back();
    else if (entry) {
      reset(entry);
      setEntry(undefined);
    }
  }, [entry, reset]);

  return { open: entry !== undefined, openSearch, closeSearch, inputRef, resultsRef };
}

type MobileSearchState = ReturnType<typeof useMobileSearch>;

/** The dock's search pill: looks like a field, opens the search. */
export function MobileSearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-14 min-w-0 flex-1 items-center gap-2 rounded-full border border-foreground/8 bg-white/50 pl-4 text-base text-muted-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_12px_30px_-12px_rgb(22_20_31/0.3)] backdrop-blur-2xl backdrop-saturate-180 dark:border-white/14 dark:bg-card/62 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_12px_30px_-12px_rgb(0_0_0/0.7)]"
    >
      <SearchIcon className="size-5 shrink-0" aria-hidden />
      Search
    </button>
  );
}

function SearchResultRow({
  option,
  text,
  tagMode,
}: {
  option: SearchOption;
  text: string;
  tagMode: boolean;
}) {
  if (option.kind === "record")
    return <RecordOptionRow option={option} text={text} active={false} />;
  return (
    <>
      <TagRow option={option} text={text} tagMode={tagMode} active={false} />
      {!tagMode && (
        <span
          aria-hidden
          className={cn(
            "flex h-8 shrink-0 items-center gap-1 rounded-full px-3 font-semibold text-sm",
            option.on ? "bg-primary/12 text-primary-text" : "bg-primary text-primary-foreground",
          )}
        >
          {option.on ? "On" : <PlusIcon className="size-3.5" strokeWidth={3} />}
          {!option.on && "Filter"}
        </span>
      )}
    </>
  );
}

function recentSearchLabel({ text, tags }: RecentSearch): string {
  return [text, ...tags.map((tag) => `${TAG_SEARCH_PREFIX}${tag}`)].filter(Boolean).join(" + ");
}

/** Tapping one runs it again: its text and its tag filters, keyboard kept up. */
function RecentSearches({ onRun }: { onRun: () => void }) {
  const { recentSearches, forgetSearch, clearRecentSearches, countSearch, setQuery, setTags } =
    useSortedRecords();
  const headingId = useId();
  const counts = useMemo(() => recentSearches.map(countSearch), [recentSearches, countSearch]);
  if (recentSearches.length === 0) return null;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <h2
          id={headingId}
          className="font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]"
        >
          Recent searches
        </h2>
        <button
          type="button"
          onPointerDown={keepFocus}
          onClick={clearRecentSearches}
          className="-my-2 px-1 py-2 font-semibold text-primary-text text-sm"
        >
          Clear
        </button>
      </div>
      <ul>
        {recentSearches.map((recent, index) => {
          const label = recentSearchLabel(recent);
          const count = counts[index] ?? 0;
          return (
            <li
              key={recentSearchKey(recent)}
              className="flex min-h-14 items-center pr-2 active:bg-foreground/5"
            >
              <button
                type="button"
                onPointerDown={keepFocus}
                onClick={() => {
                  setQuery(recent.text);
                  setTags(recent.tags);
                  onRun();
                }}
                className="flex min-w-0 flex-1 items-center gap-3 self-stretch pl-4 text-left"
              >
                <span className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
                  <HistoryIcon className="size-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-[0.95rem]">{label}</span>
                  <span className="text-muted-foreground text-xs">
                    {recent.text
                      ? counted(count, "result", "results")
                      : `Tag filter · ${counted(count, "item", "items")}`}
                  </span>
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-lg"
                className="shrink-0 text-muted-foreground"
                onPointerDown={keepFocus}
                onClick={() => forgetSearch(recent)}
                aria-label={`Remove ${label}`}
              >
                <XIcon />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * A toolbar riding on top of the keyboard (`--kb-inset`). Pressing in it must
 * not blur the field, or the keyboard would drop.
 */
function KeyboardBar({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // oxlint-disable-next-line jsx_a11y/no-static-element-interactions -- keeps focus in the field (gaps, disabled buttons too), not an action
    <div
      role="toolbar"
      aria-label={label}
      onPointerDown={keepFocus}
      className={cn(
        "absolute inset-x-0 bottom-[max(var(--kb-inset),env(safe-area-inset-bottom))] flex h-13 items-center border-border border-t bg-background/95 backdrop-blur-md group-data-[keyboard=down]/search:transition-[bottom] group-data-[keyboard=down]/search:duration-200 group-data-[keyboard=down]/search:ease-out motion-reduce:transition-none!",
        className,
      )}
    >
      {children}
    </div>
  );
}

function TagPillBar({
  pills,
  typing,
  onToggle,
  onShowAll,
}: {
  pills: PillTag[];
  typing: boolean;
  onToggle: (pill: PillTag) => void;
  onShowAll: () => void;
}) {
  return (
    <KeyboardBar label="Filter by tag" className="gap-1 pl-3">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 rounded-full bg-muted text-muted-foreground"
        aria-label="All tags"
        onClick={onShowAll}
      >
        <TagIcon />
      </Button>
      <div className="relative flex h-full min-w-0 flex-1 items-center">
        <div className="flex h-full min-w-0 flex-1 snap-x scroll-px-1 items-center gap-2 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none]">
          {pills.map((pill) => (
            <TagPill
              key={pill.tag}
              tag={pill.tag}
              selected={pill.on}
              count={pill.on ? undefined : pill.count}
              disabled={!pill.on && pill.count === 0}
              aria-pressed={pill.on}
              onClick={() => onToggle(pill)}
              className={cn(
                "h-9 shrink-0 snap-start",
                pill.matching && "border-primary",
                typing && !pill.on && !pill.matching && "opacity-50",
              )}
            />
          ))}
          <span aria-hidden className="w-8 shrink-0" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-background"
        />
      </div>
    </KeyboardBar>
  );
}

/** Tag mode's way out: the records the picked tags leave, keyboard kept up. */
function TagModeBar({
  tagCount,
  itemCount,
  onClear,
  onShow,
}: {
  tagCount: number;
  itemCount: number;
  onClear: () => void;
  onShow: () => void;
}) {
  const items = counted(itemCount, "item", "items");
  return (
    <KeyboardBar label="Picked tags" className="justify-between gap-2 pr-2 pl-4">
      <span className="min-w-0 truncate text-muted-foreground text-sm">
        <strong className="font-semibold text-foreground">
          {counted(tagCount, "tag", "tags")}
        </strong>{" "}
        · {items}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {tagCount > 0 && (
          <Button variant="ghost" size="lg" className="px-3 text-primary-text" onClick={onClear}>
            Clear
          </Button>
        )}
        <Button size="lg" className="rounded-full px-4" onClick={onShow}>
          Show {items}
        </Button>
      </span>
    </KeyboardBar>
  );
}

function fieldPlaceholder(tagCount: number): string {
  if (tagCount === 0) return "Search logins, notes, #tags";
  return tagCount === 1 ? "Search in tag" : `Search in ${tagCount} tags`;
}

/**
 * Full-screen phone search: field and Cancel on top, results under it.
 * Portaled to <body>: `DrawerProvider`'s `contain: layout` would make
 * `position: fixed` relative to the page instead of the viewport.
 */
export function MobileSearchOverlay({ state }: { state: MobileSearchState }) {
  const { open, closeSearch, inputRef, resultsRef } = state;
  const {
    query,
    setQuery,
    tags,
    tagFilters,
    toggleTag,
    removeTag,
    clearTags,
    noteSearched,
    countSearch,
    searchAll,
    categoryFilter,
    clearFilters,
  } = useSortedRecords();
  // "Search all items" runs past the filters and the scope doesn't show them.
  const filtered = !searchAll && (categoryFilter !== "all" || tagFilters.length > 0);
  const { search, sections, options } = useSearchOptions({ listTagged: true });
  const keyboardInset = useKeyboardInset(open);
  const short = useMediaQuery(SHORT_QUERY);
  const blurOnDrag = useBlurOnDrag(inputRef);
  const pills = useMemo(
    () => pillTags(tags, tagFilters.length, search.tagMode ? "" : search.text),
    [tags, tagFilters.length, search],
  );
  const showPills = open && !short && !search.tagMode && pills.length > 0;
  const showTagModeBar = open && search.tagMode;
  // Hidden while "Search all items" runs past them, as in the scope.
  const fieldTags = searchAll ? [] : tagFilters;
  const itemCount = useMemo(
    () => countSearch({ text: "", tags: tagFilters }),
    [countSearch, tagFilters],
  );
  const [, navigate] = useLocation();
  const listboxId = useId();
  const records = options.filter((option) => option.kind === "record");
  const typed = !search.tagMode && search.text !== "";

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
    };
  }, [open]);

  // `keepFocus` should already keep the field focused through a tap on the
  // results or pills, but iOS Safari was seen dropping the keyboard anyway: a
  // focus() in the same tap brings it straight back.
  const typing = useRef(false);
  const keepTyping = () => {
    if (typing.current && document.activeElement !== inputRef.current) inputRef.current?.focus();
    typing.current = false;
  };

  const toggleFilter = (tag: string, on: boolean, clearText: boolean) => {
    const next = { text: clearText ? "" : search.text, tags: [...tagFilters, tag] };
    if (!on && countSearch(next) > 0) noteSearched(next);
    toggleTag(tag);
    if (clearText) setQuery("");
    keepTyping();
  };

  const leaveTagMode = () => {
    setQuery("");
    keepTyping();
  };

  const choose = (option: SearchOption) => {
    if (option.kind === "tag") {
      if (search.tagMode) {
        toggleTag(option.tag);
        keepTyping();
      } else toggleFilter(option.tag, option.on ?? false, true);
      return;
    }
    // "Search all items" ran past the tags; saved with them it would find less next time.
    if (typed) noteSearched({ text: search.text, tags: searchAll ? [] : tagFilters });
    saveResultsScroll(resultsRef.current?.scrollTop ?? 0);
    navigate(recordPaths.record(option.record.recordId), { state: OPENED_FROM_SEARCH });
  };

  return createPortal(
    <div
      // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- stays mounted while closed, see openSearch
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      aria-hidden={!open}
      inert={!open}
      style={{ "--kb-inset": `${keyboardInset}px` } as CSSProperties}
      // Only the drop slides: rising, the bar has to be on the keyboard as it lands.
      data-keyboard={keyboardInset > 0 ? "up" : "down"}
      onPointerDownCapture={() => {
        typing.current = document.activeElement === inputRef.current;
      }}
      className={cn(
        // No z-index: sheets opened from the search (Create) portal in after it and must cover it.
        "group/search fixed inset-0 flex flex-col bg-background transition-opacity duration-150 ease-out motion-reduce:transition-none",
        !open && "pointer-events-none opacity-0",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 px-4 transition-transform duration-150 ease-out motion-reduce:transition-none",
          short
            ? "pt-[max(env(safe-area-inset-top),0.5rem)] pb-1.5"
            : "pt-[max(env(safe-area-inset-top),0.75rem)] pb-2.5",
          !open && "translate-y-3",
        )}
      >
        <InputGroup className="h-12 min-w-0 flex-1 rounded-full bg-card">
          {fieldTags.length > 0 ? (
            <InputGroupAddon
              align="inline-start"
              className="min-w-0 max-w-[60%] shrink justify-start gap-1 overflow-x-auto pl-1.5 [scrollbar-width:none]"
            >
              {fieldTags.map((tag) => (
                <TagPill
                  key={tag}
                  tag={tag}
                  selected
                  aria-label={`Remove ${tag} from search`}
                  onPointerDown={keepFocus}
                  onClick={() => {
                    removeTag(tag);
                    keepTyping();
                  }}
                  className="h-8 shrink-0"
                />
              ))}
            </InputGroupAddon>
          ) : (
            <InputGroupAddon align="inline-start" className="pl-4">
              <SearchIcon className="size-5!" />
            </InputGroupAddon>
          )}
          {/* oxlint-disable-next-line jsx_a11y/interactive-supports-focus -- an <input> already */}
          <InputGroupInput
            ref={inputRef}
            type="search"
            enterKeyHint={search.tagMode ? "done" : "search"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- an <input> already
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-label="Search vault"
            placeholder={fieldPlaceholder(fieldTags.length)}
            className="text-base [&::-webkit-search-cancel-button]:hidden"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Not on a repeat: holding Backspace to erase the text would go on through the tags.
              if (e.key === "Backspace" && e.currentTarget.value === "") {
                const last = fieldTags.at(-1);
                if (last && !e.repeat) {
                  e.preventDefault();
                  removeTag(last);
                }
                return;
              }
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (search.tagMode) return leaveTagMode();
              const [only, ...rest] = records;
              if (typed && only && rest.length === 0) choose(only);
              else e.currentTarget.blur();
            }}
          />
          {query && (
            <InputGroupAddon align="inline-end" className="pr-2">
              <InputGroupButton
                size="icon-sm"
                className="rounded-full"
                onPointerDown={keepFocus}
                onClick={() => {
                  setQuery("");
                  keepTyping();
                }}
                aria-label="Clear search"
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <Button variant="ghost" size="lg" className="px-2 text-primary-text" onClick={closeSearch}>
          Cancel
        </Button>
      </div>
      {(!short || filtered) && (
        <div className="flex shrink-0 items-center gap-2 px-2.5 pb-1">
          <div className="min-w-0 flex-1">
            <SearchScope tagMode={search.tagMode} />
          </div>
          {filtered && (
            <button
              type="button"
              onPointerDown={keepFocus}
              onClick={() => {
                clearFilters();
                keepTyping();
              }}
              className="-my-2 shrink-0 px-1.5 py-2 font-semibold text-primary-text text-xs"
            >
              Clear all
            </button>
          )}
          {(typed || (!search.tagMode && fieldTags.length > 0)) && (
            <span className="shrink-0 pr-1.5 text-muted-foreground text-xs">
              {typed
                ? counted(records.length, "result", "results")
                : counted(itemCount, "item", "items")}
            </span>
          )}
        </div>
      )}

      <div
        ref={resultsRef}
        {...blurOnDrag}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          showPills || showTagModeBar
            ? "pb-[calc(max(var(--kb-inset),env(safe-area-inset-bottom))+4.25rem)]"
            : "pb-[max(var(--kb-inset),env(safe-area-inset-bottom),1rem)]",
        )}
      >
        {typed && options.length === 0 ? (
          <div className="pt-6">
            <NoSearchResults />
          </div>
        ) : (
          <>
            {open && !search.tagMode && !search.text && <RecentSearches onRun={keepTyping} />}
            <div
              id={listboxId}
              // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- a combobox's popup; <select> can't hold rows
              role="listbox"
              aria-label={search.tagMode ? "Tags" : "Search results"}
              aria-multiselectable={search.tagMode || undefined}
            >
              {sections.map((section) =>
                // The pill bar already offers the top tags.
                !open ||
                section.options.length === 0 ||
                (showPills && section.id === "top") ? null : (
                  // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- a listbox's option group
                  <div key={section.id} role="group" aria-label={section.label}>
                    <div className="px-5 pt-4 pb-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
                      {section.label}
                    </div>
                    {section.options.map((option) => (
                      // oxlint-disable-next-line jsx_a11y/click-events-have-key-events -- tapped; the field keeps the keyboard
                      <div
                        key={option.id}
                        // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- rows of a combobox's popup
                        role="option"
                        aria-selected={option.kind === "tag" ? (option.on ?? false) : false}
                        tabIndex={-1}
                        onPointerDown={keepFocus}
                        onClick={() => choose(option)}
                        className={cn(
                          "flex min-h-14 cursor-pointer items-center gap-3 px-4 active:bg-foreground/5",
                          option.kind === "tag" && option.dimmed && "opacity-50",
                        )}
                      >
                        <SearchResultRow
                          option={option}
                          text={search.text}
                          tagMode={search.tagMode}
                        />
                      </div>
                    ))}
                  </div>
                ),
              )}
            </div>
          </>
        )}
        {typed && options.length > 0 && <OutsideScope className="mx-4 mt-4" />}
      </div>
      {showPills && (
        <TagPillBar
          pills={pills}
          typing={typed}
          onToggle={(pill) => toggleFilter(pill.tag, pill.on, pill.matching && !pill.on)}
          onShowAll={() => {
            setQuery(TAG_SEARCH_PREFIX);
            keepTyping();
          }}
        />
      )}
      {showTagModeBar && (
        <TagModeBar
          tagCount={tagFilters.length}
          itemCount={itemCount}
          onClear={() => {
            clearTags();
            keepTyping();
          }}
          onShow={leaveTagMode}
        />
      )}
    </div>,
    document.body,
  );
}
