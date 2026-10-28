import { type SearchOption, useSearchOptions } from "@repo/client";
import { useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { tagKey } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/InputGroup";
import { cn } from "@repo/ui/lib/utils";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useLocation } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { NoSearchResults } from "./NoSearchResults";
import { OutsideScope } from "./OutsideScope";
import { RecordOptionRow, SearchScope, TagRow } from "./SearchPanel";

/** Kept in the history entry the search pushes, so Back from a record lands on it again. */
type SearchEntry = { tagsBefore: string[]; scrollY: number };

function currentSearchEntry(): SearchEntry | undefined {
  const state: unknown = history.state;
  if (typeof state !== "object" || state === null || !("mobileSearch" in state)) return undefined;
  return state.mobileSearch as SearchEntry;
}

/**
 * The phone search's open state. It lives in a history entry over the vault
 * list: Back closes it, and Back from a record opened from it reopens it with
 * the same query. Closing it (Cancel or Back) clears the query and puts the
 * tag filters and the list's scroll back the way they were when it opened.
 */
export function useMobileSearch() {
  const { query, tagFilters, setQuery, toggleTag, clearTags } = useSortedRecords();
  const [entry, setEntry] = useState(currentSearchEntry);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const inputRef = useRef<HTMLInputElement>(null);
  const tagsNow = useRef(tagFilters);
  tagsNow.current = tagFilters;

  const reset = useCallback(
    ({ tagsBefore, scrollY }: SearchEntry) => {
      setQuery("");
      // The list behind filtered along with the search; once it's whole again.
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
      if (tagsNow.current.map(tagKey).join("\0") === tagsBefore.map(tagKey).join("\0")) return;
      clearTags();
      for (const tag of tagsBefore) toggleTag(tag);
    },
    [setQuery, clearTags, toggleTag],
  );

  // A query left over from elsewhere (the desktop search before a resize, or a
  // search left by a link) would filter the list with nothing on screen saying so.
  const leftoverQuery = useRef(!entry && query !== "");
  useEffect(() => {
    if (leftoverQuery.current) setQuery("");
  }, [setQuery]);

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
    const next = { tagsBefore: [...tagsNow.current], scrollY: window.scrollY };
    flushSync(() => setEntry(next));
    inputRef.current?.focus();
    history.pushState({ mobileSearch: next }, "");
  }, []);

  const closeSearch = useCallback(() => {
    if (currentSearchEntry()) history.back();
    else if (entry) {
      reset(entry);
      setEntry(undefined);
    }
  }, [entry, reset]);

  return { open: entry !== undefined, openSearch, closeSearch, inputRef };
}

export type MobileSearchState = ReturnType<typeof useMobileSearch>;

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

/**
 * Full-screen phone search: field and Cancel on top, results under it.
 * Portaled to <body>: `DrawerProvider`'s `contain: layout` would make
 * `position: fixed` relative to the page instead of the viewport.
 */
export function MobileSearchOverlay({ state }: { state: MobileSearchState }) {
  const { open, closeSearch, inputRef } = state;
  const { query, setQuery, toggleTag, noteOpened } = useSortedRecords();
  const { search, sections, options } = useSearchOptions();
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

  const choose = (option: SearchOption) => {
    if (option.kind === "tag") {
      toggleTag(option.tag);
      if (!search.tagMode) setQuery("");
      return;
    }
    noteOpened(option.record.recordId);
    navigate(recordPaths.record(option.record.recordId));
  };

  return createPortal(
    <div
      // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- stays mounted while closed, see openSearch
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        // No z-index: sheets opened from the search (Create) portal in after it and must cover it.
        "fixed inset-0 flex flex-col bg-background",
        !open && "pointer-events-none opacity-0",
      )}
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2.5">
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
            placeholder="Search logins, notes, #tags"
            className="text-base [&::-webkit-search-cancel-button]:hidden"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
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
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setQuery("")}
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
      <div className="flex shrink-0 items-center gap-2 px-2.5 pb-1">
        <div className="min-w-0 flex-1">
          <SearchScope tagMode={search.tagMode} />
        </div>
        {typed && (
          <span className="shrink-0 pr-1.5 text-muted-foreground text-xs">
            {records.length === 1 ? "1 result" : `${records.length} results`}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),1rem)]">
        {typed && options.length === 0 ? (
          <div className="pt-6">
            <NoSearchResults />
          </div>
        ) : (
          <div
            id={listboxId}
            // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- a combobox's popup; <select> can't hold rows
            role="listbox"
            aria-label={search.tagMode ? "Tags" : "Search results"}
            aria-multiselectable={search.tagMode || undefined}
          >
            {sections.map((section) =>
              !open || section.options.length === 0 ? null : (
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
                      onPointerDown={(e) => e.preventDefault()}
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
        )}
        {typed && options.length > 0 && <OutsideScope className="mx-4 mt-4" />}
      </div>
    </div>,
    document.body,
  );
}
