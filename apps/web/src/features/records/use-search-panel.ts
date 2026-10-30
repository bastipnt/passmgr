import { type SearchOption, useSearchOptions } from "@repo/client";
import { useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, useRoute } from "wouter";
import { recordPaths } from "@/app/route-paths";

export const PREVIEW_DELAY_MS = 150;

/** Widens the search past the vault, category and tags (`searchAllItems`). */
export const SEARCH_ALL_KEY = "$mod+Shift+f";

/**
 * The desktop list's search: open while the field has focus, when its results
 * replace the list. ↑↓ walk the options; the highlighted record previews on
 * the right once a query is typed or the highlight moved. Enter opens it (or
 * toggles a tag), Esc leaves and brings back the record open before (in tag
 * mode: shows the records the tags keep). A record opened past the filters
 * drops them, so the list shows it. The pointer highlights too, without
 * previewing. $mod+Shift+F searches past the filters.
 */
export function useSearchPanel(enabled: boolean) {
  const {
    query,
    setQuery,
    toggleTag,
    noteOpened,
    searchInputRef,
    canSearchAll: filtersNarrow,
    searchAllItems,
    revealRecord,
  } = useSortedRecords();
  const [, navigate] = useLocation();
  const [, params] = useRoute(recordPaths.detailAny);
  const [focused, setFocused] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  // Set by the pointer: highlights only, so sweeping across the rows opens nothing.
  const [pointed, setPointed] = useState(false);
  const pointer = useRef<{ x: number; y: number }>(undefined);
  const { search, sections, options } = useSearchOptions();
  const open = enabled && focused;
  const canSearchAll = !search.tagMode && filtersNarrow;

  const routeRecordId = useRef(params?.recordId);
  routeRecordId.current = params?.recordId;
  const originRecordId = useRef<string | undefined>(undefined);
  const previewed = useRef(false);

  const typed = search.text !== "" && !search.tagMode;
  // A typed query highlights its first record, not the tags above it.
  const active =
    options.find((option) => option.id === activeId) ??
    (typed ? options.find((option) => option.kind === "record") : undefined) ??
    options[0];

  // Only what the user asked for previews: focusing alone must not swap the open record.
  const previewId =
    open && active?.kind === "record" && !pointed && (typed || activeId !== undefined)
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
    setPointed(false);
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
      revealRecord(option.record);
      const origin = originRecordId.current;
      // Previews replaced the entry of the record open before: restore it so Back returns there.
      if (previewed.current && origin && origin !== recordId) {
        navigate(recordPaths.record(origin), { replace: true });
        navigate(recordPaths.record(recordId));
      } else if (recordId !== routeRecordId.current) navigate(recordPaths.record(recordId));
      close();
    },
    [toggleTag, search.tagMode, close, noteOpened, revealRecord, navigate],
  );

  // Scrolling the results under a still pointer fires moves too: only a real move counts.
  const point = useCallback((option: SearchOption, e: PointerEvent) => {
    const last = pointer.current;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (last && last.x === e.clientX && last.y === e.clientY) return;
    setActiveId(option.id);
    setPointed(true);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const index = active ? options.indexOf(active) : -1;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (canSearchAll) searchAllItems();
        return;
      }
      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp": {
          e.preventDefault();
          const step = e.key === "ArrowDown" ? 1 : -1;
          const next = options[Math.max(0, Math.min(options.length - 1, index + step))];
          if (next) setActiveId(next.id);
          setPointed(false);
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
    [
      active,
      options,
      choose,
      cancel,
      query,
      search.tagMode,
      setQuery,
      canSearchAll,
      searchAllItems,
    ],
  );

  return {
    open,
    search,
    sections,
    options,
    active,
    choose,
    point,
    /** Leaves the search (the ✕, Esc); in tag mode it shows the records the tags keep. */
    cancel,
    /** The category or tags narrow the search, and it isn't widened yet. */
    canSearchAll,
    searchAllItems,
    onKeyDown,
    onFocus: () => {
      pointer.current = undefined;
      originRecordId.current = routeRecordId.current;
      previewed.current = false;
      setFocused(true);
    },
    onBlur: () => setFocused(false),
  };
}

export type SearchPanelState = ReturnType<typeof useSearchPanel>;
