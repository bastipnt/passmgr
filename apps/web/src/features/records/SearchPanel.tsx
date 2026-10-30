import {
  categoryCountLabel,
  getRecordSubtitle,
  matchRange,
  type SearchOption,
  TAG_SEARCH_PREFIX,
  useVaults,
} from "@repo/client";
import { categoryLabel, useSortedRecords } from "@repo/client/src/providers/SortedRecordsProvider";
import { Highlight } from "@repo/ui/components/Highlight";
import { Kbd } from "@repo/ui/components/Kbd";
import { cn } from "@repo/ui/lib/utils";
import { counted } from "@repo/util";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CornerDownLeftIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { VaultBadge } from "@/features/vaults";
import { shortcutHint } from "@/lib/formatShortcut";
import { OutsideScope } from "./OutsideScope";
import { RecordAvatar } from "./RecordAvatar";
import { optionDomId } from "./RecordSearch";
import { SEARCH_ALL_KEY, type SearchPanelState } from "./use-search-panel";

function ScopeChip({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex h-6 max-w-40 items-center whitespace-nowrap rounded-md bg-foreground/6 px-1.5 font-medium text-foreground text-xs dark:bg-white/8">
      {children}
    </li>
  );
}

export function SearchScope({ tagMode, action }: { tagMode: boolean; action?: ReactNode }) {
  const { vaultFilter, categoryFilter, tagFilters, searchAll } = useSortedRecords();
  const { getVault } = useVaults();
  const vault = vaultFilter === "all" ? undefined : getVault(vaultFilter);

  return (
    // Wraps: a narrow list panel puts the action on a line of its own, right-aligned.
    <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 px-1.5 text-muted-foreground text-xs">
      <div className="flex min-w-48 flex-1 items-center gap-2">
        <span className="shrink-0">{tagMode ? "Tags in" : "Searching in"}</span>
        <ul aria-label="Search scope" className="flex min-w-0 flex-wrap gap-1">
          <ScopeChip>{vault ? <VaultBadge vault={vault} /> : "All vaults"}</ScopeChip>
          <ScopeChip>{searchAll ? categoryLabel("all") : categoryLabel(categoryFilter)}</ScopeChip>
          {!searchAll &&
            !tagMode &&
            tagFilters.map((tag) => (
              <ScopeChip key={tag}>
                <span className="truncate">
                  {TAG_SEARCH_PREFIX}
                  {tag}
                </span>
              </ScopeChip>
            ))}
        </ul>
      </div>
      {action}
    </div>
  );
}

function SearchAllButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-full pr-1 pl-2.5 font-semibold text-primary-text outline-none hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:bg-primary/15"
    >
      Search all items
      <Kbd aria-hidden>{shortcutHint(SEARCH_ALL_KEY)}</Kbd>
    </button>
  );
}

function EnterHint({ label }: { label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-semibold text-primary-text text-xs">
      {label}
      <Kbd>
        <CornerDownLeftIcon />
      </Kbd>
    </span>
  );
}

export function TagRow({
  option,
  text,
  tagMode,
  active,
}: {
  option: Extract<SearchOption, { kind: "tag" }>;
  text: string;
  tagMode: boolean;
  active: boolean;
}) {
  const { categoryFilter } = useSortedRecords();
  const count = tagMode
    ? `${counted(option.count, "record", "records")}${option.on ? " · on" : ""}`
    : categoryCountLabel(categoryFilter, option.count);

  return (
    <>
      {tagMode ? (
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md border",
            option.on ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
        >
          {option.on && <CheckIcon className="size-3.5" strokeWidth={3} />}
        </span>
      ) : (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 font-bold text-primary-text dark:bg-primary/20"
        >
          {TAG_SEARCH_PREFIX}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-[0.95rem]">
          <Highlight text={option.tag} range={matchRange(option.tag, text)} />
        </span>
        <span className="text-muted-foreground text-xs">{count}</span>
      </span>
      {active && <EnterHint label={option.on ? "Remove" : tagMode ? "Add" : "Add filter"} />}
    </>
  );
}

function RecordMatchLine({
  option,
  text,
}: {
  option: Extract<SearchOption, { kind: "record" }>;
  text: string;
}) {
  const { match, record } = option;
  if (match?.field === "subtitle")
    return <Highlight text={match.subtitle} range={matchRange(match.subtitle, text)} />;
  if (match?.field === "tag")
    return (
      <>
        tagged {TAG_SEARCH_PREFIX}
        <Highlight text={match.tag} range={matchRange(match.tag, text)} />
      </>
    );
  return getRecordSubtitle(record) || "—";
}

export function RecordOptionRow({
  option,
  text,
  active,
}: {
  option: Extract<SearchOption, { kind: "record" }>;
  text: string;
  active: boolean;
}) {
  const { record, match } = option;
  const { canGroupByVault } = useSortedRecords();
  const { getVault } = useVaults();
  return (
    <>
      <RecordAvatar
        record={record}
        vault={canGroupByVault ? getVault(record.vaultId) : undefined}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn("truncate font-semibold text-[0.95rem]", active && "text-primary-text")}
        >
          <Highlight
            text={record.title}
            range={match?.field === "title" ? matchRange(record.title, text) : undefined}
          />
        </span>
        <span className="truncate text-muted-foreground text-xs">
          <RecordMatchLine option={option} text={text} />
        </span>
      </span>
      {active ? (
        <EnterHint label="Open" />
      ) : (
        match?.field === "tag" && <span className="text-muted-foreground text-xs">tag</span>
      )}
    </>
  );
}

/**
 * Floats over the bottom of the results (the listbox leaves room for it to
 * scroll the last row clear), over a fade.
 */
function KeyHints({ tagMode, canSearchAll }: { tagMode: boolean; canSearchAll: boolean }) {
  const hint = (keys: ReactNode, label: string) => (
    <span className="flex items-center gap-1">
      {keys}
      <span>{label}</span>
    </span>
  );
  return (
    <div aria-hidden className="pointer-events-none sticky bottom-0 mt-auto h-0">
      <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-(--sticky-bar-fill) from-35% to-transparent" />
      <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-muted/90 px-3 py-2 text-muted-foreground text-xs shadow-[0_4px_18px_rgb(30_20_26/0.12)] ring-1 ring-foreground/8 backdrop-blur-md dark:ring-white/8">
        {hint(
          <>
            <Kbd>
              <ArrowUpIcon />
            </Kbd>
            <Kbd>
              <ArrowDownIcon />
            </Kbd>
          </>,
          "move",
        )}
        {hint(
          <Kbd>
            <CornerDownLeftIcon />
          </Kbd>,
          tagMode ? "toggle" : "open",
        )}
        {tagMode
          ? hint(<Kbd>backspace</Kbd>, "on # = search all")
          : hint(<Kbd>{TAG_SEARCH_PREFIX}</Kbd>, "tags only")}
        {canSearchAll && hint(<Kbd>{shortcutHint(SEARCH_ALL_KEY)}</Kbd>, "all items")}
        {hint(<Kbd>esc</Kbd>, tagMode ? "show records" : "close")}
      </div>
    </div>
  );
}

/**
 * The search's results in place of the record list. Pressing an option must
 * not take focus from the field (the search would close), hence the
 * `preventDefault` on mouse down.
 */
export function SearchPanel({ panel, listboxId }: { panel: SearchPanelState; listboxId: string }) {
  const { search, sections, options, active, choose, point, canSearchAll } = panel;
  const activeIndex = active ? options.indexOf(active) : -1;

  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(optionDomId(listboxId, activeIndex))
      ?.scrollIntoView({ block: "nearest" });
  }, [listboxId, activeIndex]);

  const empty = !search.tagMode && !search.text;
  const noResults = !search.tagMode && search.text && options.length === 0;

  return (
    // oxlint-disable-next-line jsx_a11y/no-static-element-interactions -- keeps focus in the field, not an action
    // flex-1, not min-h-full: the list's column only has a min height, so % wouldn't resolve.
    <div className="flex flex-1 flex-col" onMouseDown={(e) => e.preventDefault()}>
      <div className="px-3 pt-2">
        <SearchScope
          tagMode={search.tagMode}
          action={canSearchAll && <SearchAllButton onClick={panel.searchAllItems} />}
        />
      </div>
      {empty && (
        <dl className="mx-3 mt-3 grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 rounded-2xl bg-muted px-3.5 py-3 text-muted-foreground text-sm">
          <dt>
            <Kbd>abc</Kbd>
          </dt>
          <dd>
            searches <strong className="font-semibold text-foreground">records and tags</strong>
          </dd>
          <dt>
            <Kbd>{TAG_SEARCH_PREFIX}</Kbd>
          </dt>
          <dd>
            searches <strong className="font-semibold text-foreground">only tags</strong>
          </dd>
        </dl>
      )}
      <div
        id={listboxId}
        // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- a combobox's popup; <select> can't hold rows
        role="listbox"
        aria-label={search.tagMode ? "Tags" : "Search results"}
        aria-multiselectable={search.tagMode || undefined}
        className="flex flex-col pb-3"
      >
        {sections.map((section) =>
          section.options.length === 0 ? null : (
            // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- a listbox's option group
            <div key={section.id} role="group" aria-label={section.label}>
              <div className="flex items-center justify-between px-5 pt-4 pb-1.5 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
                <span>
                  {section.label}
                  {!empty && ` · ${section.options.length}`}
                </span>
                {section.aside && (
                  <span className="flex items-center gap-1 font-normal normal-case tracking-normal">
                    {section.aside}
                    <Kbd>{TAG_SEARCH_PREFIX}</Kbd>
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5 px-3">
                {section.options.map((option) => {
                  const index = options.indexOf(option);
                  const isActive = option === active;
                  return (
                    // oxlint-disable-next-line jsx_a11y/click-events-have-key-events -- the field handles the keys (aria-activedescendant)
                    <div
                      key={option.id}
                      id={optionDomId(listboxId, index)}
                      // oxlint-disable-next-line jsx_a11y/prefer-tag-over-role -- rows of a combobox's popup
                      role="option"
                      aria-selected={option.kind === "tag" && search.tagMode ? option.on : isActive}
                      tabIndex={-1}
                      onClick={() => choose(option)}
                      onPointerMove={(e) => point(option, e)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl border border-transparent px-2.5 py-2 hover:bg-foreground/4 dark:hover:bg-white/6 hover:[--vault-mark-ring:color-mix(in_oklab,var(--color-foreground)_4%,var(--sticky-bar-fill))] dark:hover:[--vault-mark-ring:color-mix(in_oklab,white_6%,var(--sticky-bar-fill))]",
                        isActive &&
                          "border-primary/25 bg-primary/8 [--vault-mark-ring:color-mix(in_oklab,var(--color-primary)_8%,var(--sticky-bar-fill))] dark:bg-primary/15 dark:[--vault-mark-ring:color-mix(in_oklab,var(--color-primary)_15%,var(--sticky-bar-fill))]",
                        option.kind === "tag" && option.dimmed && !isActive && "opacity-50",
                      )}
                    >
                      {option.kind === "tag" ? (
                        <TagRow
                          option={option}
                          text={search.text}
                          tagMode={search.tagMode}
                          active={isActive}
                        />
                      ) : (
                        <RecordOptionRow option={option} text={search.text} active={isActive} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ),
        )}
      </div>
      {noResults && <p className="px-5 pt-3 text-muted-foreground text-sm">No results</p>}
      {!search.tagMode && search.text && <OutsideScope className="mx-3 mt-3" />}
      {/* Room to scroll the last row clear of the hints. */}
      <div aria-hidden className="h-16 shrink-0" />
      <KeyHints tagMode={search.tagMode} canSearchAll={canSearchAll} />
    </div>
  );
}
