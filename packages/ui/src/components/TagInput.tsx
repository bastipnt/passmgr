"use client";

import { Combobox } from "@base-ui/react/combobox";
import { fieldClassName } from "@repo/ui/lib/field-styles";
import { popupClassName, popupItemClassName } from "@repo/ui/lib/popup-styles";
import { cn } from "@repo/ui/lib/utils";
import { tagKey as key, normalizeTag } from "@repo/util";
import { PlusIcon, TagIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";

type TagOption = { tag: string; create?: true };

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Tags to offer while typing (the ones already in use). */
  suggestions: readonly string[];
  id?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  onBlur?: () => void;
};

/**
 * Chips with a text field: pick a suggested tag or type a new one (Enter or a
 * comma adds it). Tags match without case, so a typed "work" picks "Work".
 */
export function TagInput({
  value,
  onChange,
  suggestions,
  id,
  placeholder = "Add a tag",
  maxLength,
  disabled,
  "aria-invalid": invalid,
  onBlur,
}: TagInputProps) {
  const [query, setQuery] = useState("");
  // What was typed and not yet added; the combobox clears the input before blur.
  const pending = useRef("");
  const typed = normalizeTag(query);
  const chosen = new Set(value.map(key));
  const matches = suggestions.filter(
    (tag) => !chosen.has(key(tag)) && key(tag).includes(key(typed)),
  );
  const exact = suggestions.find((tag) => key(tag) === key(typed));
  const options: TagOption[] = [
    ...(typed && !exact && !chosen.has(key(typed)) ? [{ tag: typed, create: true as const }] : []),
    ...matches
      .sort((a, b) => Number(key(b) === key(typed)) - Number(key(a) === key(typed)))
      .map((tag) => ({ tag })),
  ];

  function add(...tags: string[]) {
    const next = [...value];
    for (const tag of tags.map(normalizeTag)) {
      const spelled = suggestions.find((own) => key(own) === key(tag)) ?? tag;
      if (tag && !next.some((own) => key(own) === key(tag))) next.push(spelled);
    }
    if (next.length > value.length) onChange(next);
    pending.current = "";
    setQuery("");
  }

  // A pasted "a, b" adds both; the text after the last comma stays typed.
  function onInputValueChange(text: string, { reason }: Combobox.Root.ChangeEventDetails) {
    if (reason === "input-change") pending.current = text;
    else if (reason === "escape-key") pending.current = "";
    if (!text.includes(",")) {
      setQuery(text);
      return;
    }
    const parts = text.split(",");
    const rest = parts.pop() ?? "";
    add(...parts);
    pending.current = rest;
    setQuery(rest);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // With nothing to pick (the tag is already there), Enter would submit the form.
    if (event.key === "Enter" && typed && options.length === 0) {
      event.preventDefault();
      add(typed);
    }
  }

  return (
    <Combobox.Root<TagOption, true>
      multiple
      items={options}
      filter={null}
      autoHighlight
      disabled={disabled}
      value={value.map((tag) => ({ tag }))}
      onValueChange={(next) => {
        onChange(next.map((option) => option.tag));
        pending.current = "";
        setQuery("");
      }}
      inputValue={query}
      onInputValueChange={onInputValueChange}
      isItemEqualToValue={(a, b) => key(a.tag) === key(b.tag)}
      itemToStringLabel={(option) => option.tag}
    >
      <Combobox.InputGroup
        aria-invalid={invalid}
        className={cn(
          fieldClassName,
          "flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 px-2.5 py-1.5 focus-within:border-ring focus-within:bg-white focus-within:ring-4 focus-within:ring-ring/15 dark:focus-within:bg-white/5 dark:focus-within:ring-ring/20",
        )}
      >
        <TagIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Combobox.Chips className="flex flex-1 flex-wrap items-center gap-1.5">
          {value.map((tag) => (
            <Combobox.Chip
              key={key(tag)}
              aria-label={tag}
              className="flex h-6 items-center gap-1 rounded-full bg-primary/10 pr-1 pl-2.5 font-medium text-foreground text-xs outline-none data-highlighted:bg-primary/20 dark:bg-white/10"
            >
              {tag}
              <Combobox.ChipRemove
                aria-label={`Remove ${tag}`}
                className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <XIcon className="size-3" />
              </Combobox.ChipRemove>
            </Combobox.Chip>
          ))}
          <Combobox.Input
            id={id}
            placeholder={value.length > 0 ? "" : placeholder}
            maxLength={maxLength}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Leaving the field (Save included) keeps what was typed.
              if (pending.current) add(pending.current);
              onBlur?.();
            }}
            className="h-7 min-w-24 flex-1 border-0 bg-transparent p-0 text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </Combobox.Chips>
      </Combobox.InputGroup>

      {options.length > 0 && (
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="isolate z-50">
            <Combobox.Popup className={cn(popupClassName, "max-h-64")}>
              <Combobox.List>
                {(option: TagOption) => (
                  <Combobox.Item
                    key={option.create ? `create:${key(option.tag)}` : key(option.tag)}
                    value={option}
                    className={cn(
                      popupItemClassName,
                      "data-highlighted:bg-primary/8 dark:data-highlighted:bg-white/8",
                    )}
                  >
                    {option.create ? (
                      <>
                        <PlusIcon />
                        Add “{option.tag}”
                      </>
                    ) : (
                      <>
                        <TagIcon className="text-muted-foreground" />
                        {option.tag}
                      </>
                    )}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      )}
    </Combobox.Root>
  );
}
