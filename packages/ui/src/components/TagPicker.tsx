"use client";

import { Combobox } from "@base-ui/react/combobox";
import { buttonVariants } from "@repo/ui/components/Button";
import { fieldClassName } from "@repo/ui/lib/field-styles";
import {
  popupCheckableItemClassName,
  popupClassName,
  popupIndicatorClassName,
} from "@repo/ui/lib/popup-styles";
import { cn } from "@repo/ui/lib/utils";
import { tagKey as key } from "@repo/util";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

type TagPickerProps = {
  tags: readonly { tag: string; count: number }[];
  selected: readonly string[];
  onToggle: (tag: string) => void;
  /** The trigger's text, also its accessible name (a combobox takes none from its content). */
  label: string;
};

/**
 * A pill that opens every tag in a searchable list, the selected ones
 * checked. A tag with a count of 0 can't be picked (it would empty the list).
 */
export function TagPicker({ tags, selected, onToggle, label }: TagPickerProps) {
  const counts = new Map(tags.map(({ tag, count }) => [key(tag), count]));
  const selectedKeys = new Set(selected.map(key));

  return (
    <Combobox.Root<string, true>
      multiple
      items={tags.map(({ tag }) => tag)}
      value={[...selected]}
      onValueChange={(next) => {
        const nextKeys = new Set(next.map(key));
        const changed =
          next.find((tag) => !selectedKeys.has(key(tag))) ??
          selected.find((tag) => !nextKeys.has(key(tag)));
        if (changed) onToggle(changed);
      }}
      isItemEqualToValue={(a, b) => key(a) === key(b)}
    >
      <Combobox.Trigger
        aria-label={label}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "rounded-full px-3 text-[0.84rem]",
        )}
      >
        {label}
        <ChevronDownIcon className="text-muted-foreground" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner align="end" sideOffset={6} className="isolate z-50">
          <Combobox.Popup
            aria-label="Tags"
            className={cn(popupClassName, "flex max-h-80 w-64 flex-col overflow-y-hidden")}
          >
            <Combobox.Input
              placeholder="Search tags"
              aria-label="Search tags"
              className={cn(
                fieldClassName,
                "mb-1.5 h-9 w-full shrink-0 px-2.5 text-sm outline-none",
              )}
            />
            <Combobox.Empty className="px-2.5 py-1.5 text-muted-foreground text-sm empty:hidden">
              No tag matches.
            </Combobox.Empty>
            <Combobox.List className="scrollbar-rounded -mx-1.5 min-h-0 overflow-y-auto px-1.5">
              {(tag: string) => {
                const isSelected = selectedKeys.has(key(tag));
                const count = counts.get(key(tag)) ?? 0;
                return (
                  <Combobox.Item
                    key={key(tag)}
                    value={tag}
                    disabled={count === 0 && !isSelected}
                    className={cn(
                      popupCheckableItemClassName,
                      "data-highlighted:bg-primary/8 dark:data-highlighted:bg-white/8",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{tag}</span>
                    {!isSelected && (
                      <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
                    )}
                    <Combobox.ItemIndicator className={popupIndicatorClassName}>
                      <CheckIcon />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                );
              }}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
