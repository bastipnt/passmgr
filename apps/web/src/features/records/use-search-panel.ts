import { parseSearch, type SearchItem, type SearchSection, searchSections } from "@repo/client";
import { categoryLabel, useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { tagKey } from "@repo/schema";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { recordPaths } from "@/app/route-paths";

export const PREVIEW_DELAY_MS = 150;

export type SearchOption = SearchItem & { id: string; on?: boolean };

type SearchOptionSection = Omit<SearchSection, "items"> & { options: SearchOption[] };

/**
 * The desktop list's search: open while the field has focus, when its results
 * replace the list. ↑↓ walk the options; the highlighted record previews on
 * the right once a query is typed or the highlight moved. Enter opens it (or
 * toggles a tag), Esc leaves and brings back the record open before.
 */
export function useSearchPanel(enabled: boolean) {
  const {
    query,
    setQuery,
    categoryFilter,
    tagFilters,
    tags,
    toggleTag,
    recordMatches,
    recentRecords,
    noteOpened,
    searchAll,
    searchInputRef,
  } = useSortedRecords();
  const [, navigate] = useLocation();
  const [, params] = useRoute(recordPaths.detailAny);
  const [focused, setFocused] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const search = useMemo(() => parseSearch(query), [query]);
  const open = enabled && focused;

  const routeRecordId = useRef(params?.recordId);
  routeRecordId.current = params?.recordId;
  const originRecordId = useRef<string | undefined>(undefined);
  const previewed = useRef(false);

  const sections = useMemo((): SearchOptionSection[] => {
    const selected = new Set(tagFilters.map(tagKey));
    return searchSections({
      search,
      tags,
      selectedCount: tagFilters.length,
      recordMatches,
      recentRecords,
      recordsLabel:
        searchAll || categoryFilter === "all" ? "Records" : categoryLabel(categoryFilter),
    }).map(({ items, ...section }) => ({
      ...section,
      options: items.map((item) =>
        item.kind === "tag"
          ? { ...item, id: `tag:${tagKey(item.tag)}`, on: selected.has(tagKey(item.tag)) }
          : { ...item, id: `record:${item.record.recordId}` },
      ),
    }));
  }, [search, tags, tagFilters, recordMatches, recentRecords, searchAll, categoryFilter]);

  const options = useMemo(() => sections.flatMap((section) => section.options), [sections]);
  const typed = search.text !== "" && !search.tagMode;
  // A typed query highlights its first record, not the tags above it.
  const active =
    options.find((option) => option.id === activeId) ??
    (typed ? options.find((option) => option.kind === "record") : undefined) ??
    options[0];

  // Only what the user asked for previews: focusing alone must not swap the open record.
  const previewId =
    open && active?.kind === "record" && (typed || activeId !== undefined)
      ? active.record.recordId
      : undefined;
  // Debounced: opening a record decrypts and renders it, so holding ↓ would stall on every row.
  useEffect(() => {
    if (!previewId || previewId === routeRecordId.current) return;
    const timer = setTimeout(() => {
      previewed.current = true;
      navigate(recordPaths.record(previewId), { replace: true });
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [previewId, navigate]);

  const close = useCallback(() => {
    setQuery("");
    setActiveId(undefined);
    setFocused(false);
    searchInputRef.current?.blur();
  }, [setQuery, searchInputRef]);

  const cancel = useCallback(() => {
    const origin = originRecordId.current;
    if (previewed.current && origin && origin !== routeRecordId.current)
      navigate(recordPaths.record(origin), { replace: true });
    close();
  }, [navigate, close]);

  const choose = useCallback(
    (option: SearchOption) => {
      setActiveId(option.id);
      if (option.kind === "tag") {
        toggleTag(option.tag);
        if (!search.tagMode) close();
        return;
      }
      const { recordId } = option.record;
      noteOpened(recordId);
      const origin = originRecordId.current;
      // Previews replaced the entry of the record open before: restore it so Back returns there.
      if (previewed.current && origin && origin !== recordId) {
        navigate(recordPaths.record(origin), { replace: true });
        navigate(recordPaths.record(recordId));
      } else if (recordId !== routeRecordId.current) navigate(recordPaths.record(recordId));
      close();
    },
    [toggleTag, search.tagMode, close, noteOpened, navigate],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const index = active ? options.indexOf(active) : -1;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp": {
          e.preventDefault();
          const step = e.key === "ArrowDown" ? 1 : -1;
          const next = options[Math.max(0, Math.min(options.length - 1, index + step))];
          if (next) setActiveId(next.id);
          return;
        }
        case "Enter":
          if (active) {
            e.preventDefault();
            choose(active);
          }
          return;
        case "Escape":
          if (query) e.preventDefault();
          cancel();
          return;
        case "Backspace":
          if (search.tagMode && e.currentTarget.value === "") {
            e.preventDefault();
            setQuery("");
          }
      }
    },
    [active, options, choose, cancel, query, search.tagMode, setQuery],
  );

  return {
    open,
    search,
    sections,
    options,
    active,
    choose,
    onKeyDown,
    onFocus: () => {
      originRecordId.current = routeRecordId.current;
      previewed.current = false;
      setFocused(true);
    },
    onBlur: () => setFocused(false),
  };
}

export type SearchPanelState = ReturnType<typeof useSearchPanel>;
