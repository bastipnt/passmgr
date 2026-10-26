import { useShortcut, useVaults } from "@repo/client";
import { useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/InputGroup";
import { Kbd } from "@repo/ui/components/Kbd";
import { SearchIcon, XIcon } from "lucide-react";
import { modKey } from "@/lib/formatShortcut";

export function RecordSearch() {
  const { query, setQuery, vaultFilter, searchInputRef } = useSortedRecords();
  const { getVault } = useVaults();
  const label = `Search ${vaultFilter === "all" ? "all vaults" : getVault(vaultFilter)?.name}`;
  useShortcut("$mod+k", () => searchInputRef.current?.focus(), {
    description: "Focus search",
    allowInInput: true,
  });

  return (
    <InputGroup className="shrink-0">
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={(el) => {
          searchInputRef.current = el;
        }}
        placeholder={`${label}…`}
        aria-label={label}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.preventDefault();
            setQuery("");
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        {query ? (
          <InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label="Clear search">
            <XIcon />
          </InputGroupButton>
        ) : (
          <Kbd aria-hidden>{modKey}K</Kbd>
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}
