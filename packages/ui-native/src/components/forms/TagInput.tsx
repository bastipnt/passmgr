import { tagKey as key, normalizeTag as normalize } from "@repo/util";
import { Plus, Tag, X } from "lucide-react-native";
import { useState } from "react";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import { Pressable, Text, TextInput, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { cn } from "../../lib/utils";
import { fieldBorder, fieldLabel, fieldSurface } from "./field-styles";

/** Offered below the field while nothing is typed; typing searches all of them. */
const IDLE_SUGGESTIONS = 8;

export type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Tags to offer (the ones already in use). */
  suggestions: readonly string[];
  label?: string;
  error?: string;
  placeholder?: string;
  maxLength?: number;
  editable?: boolean;
  onBlur?: () => void;
};

/**
 * Web's `TagInput`: chips with a text field, the tags in use offered below.
 * Return or a comma adds what's typed; tags match without case, so a typed
 * "work" picks "Work".
 */
export function TagInput({
  value,
  onChange,
  suggestions,
  label,
  error,
  placeholder = "Add a tag",
  maxLength,
  editable = true,
  onBlur,
}: TagInputProps) {
  const [query, setQuery] = useState("");
  const [muted, primary] = useCSSVariable([
    "--color-muted-foreground",
    "--color-primary",
  ]) as string[];
  const chosen = new Set(value.map(key));
  const typed = key(query);
  const offered = suggestions.filter((tag) => !chosen.has(key(tag)) && key(tag).includes(typed));
  const shown = typed ? offered : offered.slice(0, IDLE_SUGGESTIONS);

  function add(...tags: string[]) {
    const next = [...value];
    for (const tag of tags.map(normalize)) {
      const spelled = suggestions.find((own) => key(own) === key(tag)) ?? tag;
      if (tag && !next.some((own) => key(own) === key(tag))) next.push(spelled);
    }
    if (next.length > value.length) onChange(next);
  }

  // A pasted "a, b" adds both; the text after the last comma stays typed.
  function onChangeText(text: string) {
    if (!text.includes(",")) {
      setQuery(text);
      return;
    }
    const parts = text.split(",");
    const rest = parts.pop() ?? "";
    add(...parts);
    setQuery(rest);
  }

  return (
    <View className="gap-2">
      {label && <Text className={fieldLabel}>{label}</Text>}

      <View
        className={cn(
          "min-h-12 flex-row flex-wrap items-center gap-1.5 px-3 py-2",
          fieldSurface,
          fieldBorder(!!error),
        )}
      >
        <Tag size={16} color={muted} />
        {value.map((tag) => (
          <Pressable
            key={key(tag)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${tag}`}
            disabled={!editable}
            onPress={() => onChange(value.filter((own) => key(own) !== key(tag)))}
            className="h-7 flex-row items-center gap-1 rounded-full bg-primary/10 pr-2 pl-3 active:bg-primary/20 dark:bg-white/10"
          >
            <Text className="font-medium text-foreground text-sm">{tag}</Text>
            <X size={14} color={muted} />
          </Pressable>
        ))}
        <TextInput
          value={query}
          onChangeText={onChangeText}
          onSubmitEditing={() => {
            add(query);
            setQuery("");
          }}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === "Backspace" && query === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            // Leaving the field keeps what was typed.
            add(query);
            setQuery("");
            onBlur?.();
          }}
          submitBehavior="submit"
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={maxLength}
          editable={editable}
          placeholder={value.length > 0 ? "" : placeholder}
          placeholderTextColorClassName="text-muted-foreground"
          accessibilityLabel={label ?? "Tags"}
          className="h-8 min-w-24 flex-1 text-[16px] text-foreground"
        />
      </View>

      {shown.length > 0 && editable && (
        <View className="flex-row flex-wrap gap-1.5">
          {shown.map((tag) => (
            <Pressable
              key={key(tag)}
              accessibilityRole="button"
              accessibilityLabel={`Add tag ${tag}`}
              onPress={() => {
                add(tag);
                setQuery("");
              }}
              className="h-8 flex-row items-center gap-1 rounded-full border border-foreground/12 px-3 active:bg-foreground/5 dark:border-white/14"
            >
              <Plus size={14} color={primary} />
              <Text className="text-foreground text-sm">{tag}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {error && <Text className="text-destructive text-sm">{error}</Text>}
    </View>
  );
}

export type ControlledTagInputProps<TFieldValues extends FieldValues> = Omit<
  TagInputProps,
  "value" | "onChange" | "onBlur" | "error"
> & {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
};

export function ControlledTagInput<TFieldValues extends FieldValues>({
  control,
  name,
  ...rest
}: ControlledTagInputProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        // A list's error sits on the list, or (one bad tag) on that tag.
        const error = Array.isArray(fieldState.error)
          ? fieldState.error.find(Boolean)
          : fieldState.error;
        return (
          <TagInput
            value={(field.value as string[] | undefined) ?? []}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={error?.message}
            {...rest}
          />
        );
      }}
    />
  );
}
