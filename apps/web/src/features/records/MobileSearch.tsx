import {
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
import { useBlurOnDrag } from "@repo/ui/hooks/use-blur-on-drag";
import { useMediaQuery } from "@repo/ui/hooks/use-media-query";
import { useViewportLayer } from "@repo/ui/hooks/use-viewport-layer";
import { handOffKeyboard, releaseKeyboard } from "@repo/ui/lib/keyboard-handoff";
import { restoreScroll } from "@repo/ui/lib/restore-scroll";
import { cn } from "@repo/ui/lib/utils";
import { counted } from "@repo/util";
import { HistoryIcon, SearchIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { NoSearchResults } from "./NoSearchResults";
import { OutsideScope } from "./OutsideScope";
import { RecordOptionRow, SearchAllButton, SearchScope } from "./SearchPanel";
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
 * Phones in landscape: with the keyboard up, the scope row would leave the
 * results no room. By the layout, not the keyboard, so dropping the
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
 * Full-screen phone search: field and Cancel on top, results under it.
 * Portaled to <body>: `DrawerProvider`'s `contain: layout` would make
 * `position: fixed` relative to the page instead of the viewport.
 */
export function MobileSearchOverlay({ state }: { state: MobileSearchState }) {
  const { open, closeSearch, inputRef, resultsRef } = state;
  const {
    query,
    setQuery,
    tagFilters,
    noteSearched,
    countSearch,
    searchAll,
    searchAllItems,
    canSearchAll: filtered,
    setTagSearch,
    recentSearches,
  } = useSortedRecords();
  const { search, sections, options } = useSearchOptions({ listTagged: true, withTags: false });
  const short = useMediaQuery(SHORT_QUERY);
  const blurOnDrag = useBlurOnDrag(inputRef);
  const itemCount = useMemo(
    () => countSearch({ text: "", tags: tagFilters }),
    [countSearch, tagFilters],
  );
  const [, navigate] = useLocation();
  const listboxId = useId();
  const typed = search.text !== "";
  const layerRef = useRef<HTMLDivElement>(null);
  useViewportLayer(layerRef, open);

  // No `#` tag mode on a phone: tags still match as part of a record, typed `#` or not.
  useEffect(() => {
    setTagSearch(false);
    return () => setTagSearch(true);
  }, [setTagSearch]);

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
  // results, but iOS Safari was seen dropping the keyboard anyway: a
  // focus() in the same tap brings it straight back.
  const typing = useRef(false);
  const keepTyping = () => {
    if (typing.current && document.activeElement !== inputRef.current) inputRef.current?.focus();
    typing.current = false;
  };

  const choose = (option: SearchOption) => {
    if (option.kind !== "record") return;
    // "Search all items" ran past the tags; saved with them it would find less next time.
    if (typed) noteSearched({ text: search.text, tags: searchAll ? [] : tagFilters });
    saveResultsScroll(resultsRef.current?.scrollTop ?? 0);
    navigate(recordPaths.record(option.record.recordId), { state: OPENED_FROM_SEARCH });
  };

  return createPortal(
    <div
      ref={layerRef}
      // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- stays mounted while closed, see openSearch
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      aria-hidden={!open}
      inert={!open}
      onPointerDownCapture={() => {
        typing.current = document.activeElement === inputRef.current;
      }}
      className={cn(
        // No z-index: sheets opened from the search (Create) portal in after it and must cover it.
        // The ::after carries the ground on below the layer (sized to the visual viewport, so to the
        // keyboard's top) down to the bottom of the screen: the keyboard is translucent.
        "fixed inset-x-0 top-0 flex h-dvh flex-col bg-background transition-opacity duration-150 ease-out after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-lvh after:bg-background motion-reduce:transition-none",
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
          <InputGroupAddon align="inline-start" className="pl-4">
            <SearchIcon className="size-5!" />
          </InputGroupAddon>
          {/* oxlint-disable-next-line jsx_a11y/interactive-supports-focus -- an <input> already */}
          <InputGroupInput
            ref={inputRef}
            type="search"
            enterKeyHint="search"
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
            placeholder="Search logins, notes, tags"
            className="text-base [&::-webkit-search-cancel-button]:hidden"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // The search key drops the keyboard to show the whole list; a tap opens a record.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.currentTarget.blur();
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
        <div className="shrink-0 px-5 pb-2">
          <SearchScope
            lane="phone"
            action={
              (typed || (!searchAll && tagFilters.length > 0)) && (
                <span className="shrink-0">
                  {typed
                    ? counted(options.length, "result", "results")
                    : counted(itemCount, "item", "items")}
                </span>
              )
            }
            laneAction={
              filtered && (
                <SearchAllButton
                  shortcut={false}
                  aria-label="Search all items"
                  className="ml-0 h-10 rounded-full px-3 text-sm"
                  onPointerDown={keepFocus}
                  onClick={() => {
                    searchAllItems();
                    keepTyping();
                  }}
                >
                  Search all
                </SearchAllButton>
              )
            }
          />
        </div>
      )}

      <div
        ref={resultsRef}
        {...blurOnDrag}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        {typed && options.length === 0 ? (
          <div className="pt-6">
            <NoSearchResults />
          </div>
        ) : (
          <>
            {open && !typed && <RecentSearches onRun={keepTyping} />}
            {open && !typed && sections.length === 0 && recentSearches.length === 0 && (
              <p className="px-8 pt-10 text-center text-muted-foreground text-sm">
                Search titles, usernames, websites and tags.
              </p>
            )}
            <div
              id={listboxId}
              // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- a combobox's popup; <select> can't hold rows
              role="listbox"
              aria-label="Search results"
            >
              {open &&
                sections.map((section) => (
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
                        aria-selected={false}
                        tabIndex={-1}
                        onPointerDown={keepFocus}
                        onClick={() => choose(option)}
                        className="flex min-h-14 cursor-pointer items-center gap-3 px-4 active:bg-foreground/5"
                      >
                        {option.kind === "record" && (
                          <RecordOptionRow
                            option={option}
                            text={search.text}
                            active={false}
                            tagMark={false}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </>
        )}
        {typed && options.length > 0 && <OutsideScope className="mx-4 mt-4" />}
      </div>
    </div>,
    document.body,
  );
}
