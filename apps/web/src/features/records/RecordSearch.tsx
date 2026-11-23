import {
  parseSearch,
  TAG_SEARCH_PREFIX,
  useShortcut,
  useSortedRecords,
  useVaults,
} from "@repo/client";
import { comboboxInputProps } from "@repo/ui/components/Combobox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/InputGroup";
import { Kbd } from "@repo/ui/components/Kbd";
import { counted } from "@repo/util";
import { SearchIcon, TagIcon, XIcon } from "lucide-react";
import { modKey } from "@/lib/formatShortcut";
import { SHORTCUTS } from "@/lib/shortcuts";
import type { SearchPanelState } from "./use-search-panel";

/** The esc hint with the mouse's way out: the ✕ leaves the search as Esc does. */
function CloseChip({ onClose }: { onClose: () => void }) {
  return (
    <span className="flex h-6 shrink-0 items-center rounded-full bg-foreground/6 font-semibold text-[0.7rem] text-muted-foreground dark:bg-white/8">
      <span aria-hidden className="pr-1.5 pl-2.5">
        esc
      </span>
      <button
        type="button"
        aria-label="Close search"
        // Keeps focus in the field until the click closes the search on purpose.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClose}
        className="flex size-6 items-center justify-center rounded-full bg-foreground/7 text-foreground outline-none hover:bg-foreground/14 focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-white/8 dark:hover:bg-white/16"
      >
        <XIcon className="size-3" strokeWidth={2.75} />
      </button>
    </span>
  );
}

/** Tag mode's way back to the list. Esc does the same, so the pill carries the esc hint; short, the field is shared. */
function ShowRecordsButton({ onShow }: { onShow: () => void }) {
  const { countSearch, tagFilters } = useSortedRecords();
  const label = `Show ${counted(countSearch({ text: "", tags: tagFilters }), "record", "records")}`;
  return (
    <InputGroupButton
      variant="default"
      aria-label={label}
      title={`${label} (esc)`}
      className="h-6 shrink-0 gap-1.5 rounded-full pr-1 pl-2.5 font-semibold text-xs"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onShow}
    >
      {label.replace(/ records?$/, "")}
      <Kbd
        aria-hidden
        className="h-4 bg-primary-foreground/20 text-[0.65rem] text-primary-foreground"
      >
        esc
      </Kbd>
    </InputGroupButton>
  );
}

export function RecordSearch({ panel, listboxId }: { panel: SearchPanelState; listboxId: string }) {
  const { query, setQuery, tagSearch, vaultFilter, searchInputRef } = useSortedRecords();
  const { getVault } = useVaults();
  const { open } = panel;
  // The field's own mode, from what it holds: the panel's `search` can trail it.
  const { tagMode } = parseSearch(query, tagSearch);
  const label = `Search ${vaultFilter === "all" ? "all vaults" : getVault(vaultFilter)?.name}`;
  useShortcut(SHORTCUTS.focusSearch.key, () => searchInputRef.current?.focus(), {
    description: SHORTCUTS.focusSearch.description,
    allowInInput: true,
  });
  const value = tagMode ? query.trimStart().slice(TAG_SEARCH_PREFIX.length) : query;

  return (
    <InputGroup className="shrink-0">
      <InputGroupAddon align="inline-start">
        {tagMode ? (
          <span className="flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground text-xs">
            <TagIcon className="size-3!" aria-hidden />
            Tags
          </span>
        ) : (
          <SearchIcon />
        )}
      </InputGroupAddon>
      <InputGroupInput
        ref={(el) => {
          searchInputRef.current = el;
        }}
        {...comboboxInputProps({ listboxId, open, ...panel.combobox })}
        placeholder={tagMode ? "Find tags…" : open ? "Search records and tags…" : `${label}…`}
        aria-label={tagMode ? "Search tags" : label}
        value={value}
        onChange={(e) =>
          setQuery(tagMode ? `${TAG_SEARCH_PREFIX}${e.target.value}` : e.target.value)
        }
        onFocus={panel.onFocus}
        onBlur={panel.onBlur}
      />
      <InputGroupAddon align="inline-end" className="gap-1.5 pr-1.5">
        {open ? (
          tagMode ? (
            <ShowRecordsButton onShow={panel.cancel} />
          ) : (
            <CloseChip onClose={panel.cancel} />
          )
        ) : query ? (
          <InputGroupButton
            size="icon-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <XIcon />
          </InputGroupButton>
        ) : (
          <Kbd aria-hidden>{`${modKey}K`}</Kbd>
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}
