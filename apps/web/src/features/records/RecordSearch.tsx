import { TAG_SEARCH_PREFIX, useShortcut, useVaults } from "@repo/client";
import { useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/InputGroup";
import { Kbd } from "@repo/ui/components/Kbd";
import { SearchIcon, TagIcon, XIcon } from "lucide-react";
import { modKey } from "@/lib/formatShortcut";
import type { SearchPanelState } from "./use-search-panel";

export function optionDomId(listboxId: string, index: number) {
  return `${listboxId}-${index}`;
}

export function RecordSearch({ panel, listboxId }: { panel: SearchPanelState; listboxId: string }) {
  const { query, setQuery, vaultFilter, searchInputRef } = useSortedRecords();
  const { getVault } = useVaults();
  const { open, search, options, active } = panel;
  const label = `Search ${vaultFilter === "all" ? "all vaults" : getVault(vaultFilter)?.name}`;
  useShortcut("$mod+k", () => searchInputRef.current?.focus(), {
    description: "Focus search",
    allowInInput: true,
  });
  const value = search.tagMode ? query.trimStart().slice(TAG_SEARCH_PREFIX.length) : query;

  return (
    <InputGroup className="shrink-0">
      <InputGroupAddon align="inline-start">
        {search.tagMode ? (
          <span className="flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground text-xs">
            <TagIcon className="size-3!" aria-hidden />
            Tags
          </span>
        ) : (
          <SearchIcon />
        )}
      </InputGroupAddon>
      {/* oxlint-disable-next-line jsx_a11y/interactive-supports-focus -- an <input> already */}
      <InputGroupInput
        ref={(el) => {
          searchInputRef.current = el;
        }}
        // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- an <input> already
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active ? optionDomId(listboxId, options.indexOf(active)) : undefined
        }
        placeholder={
          search.tagMode ? "Find tags…" : open ? "Search records and tags…" : `${label}…`
        }
        aria-label={search.tagMode ? "Search tags" : label}
        value={value}
        onChange={(e) =>
          setQuery(search.tagMode ? `${TAG_SEARCH_PREFIX}${e.target.value}` : e.target.value)
        }
        onFocus={panel.onFocus}
        onBlur={panel.onBlur}
        onKeyDown={panel.onKeyDown}
      />
      <InputGroupAddon align="inline-end">
        {query ? (
          <InputGroupButton
            size="icon-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <XIcon />
          </InputGroupButton>
        ) : (
          <Kbd aria-hidden>{open ? "esc" : `${modKey}K`}</Kbd>
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}
