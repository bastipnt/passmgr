import { cn } from "@repo/ui/lib/utils";
import { SearchIcon } from "lucide-react";
import type { ComponentProps } from "react";

type SettingsSearchFieldProps = {
  label?: string;
  placeholder?: string;
  className?: string;
  /** Extra props of the input (a combobox's ref, ARIA and keys). */
  inputProps?: Omit<ComponentProps<"input">, "type" | "value" | "onChange" | "placeholder">;
} & (
  | { value: string; onValueChange: (value: string) => void }
  | { value?: never; onValueChange?: never }
);

/** A search field in the settings look: 40px on desktop, 52px with 17px text on a phone. */
export function SettingsSearchField({
  label = "Search settings",
  placeholder = label,
  value,
  onValueChange,
  className,
  inputProps,
}: SettingsSearchFieldProps) {
  return (
    <label
      className={cn(
        "flex h-10 items-center gap-2 rounded-xl border border-input bg-field px-3 text-muted-foreground focus-within:border-ring max-sm:h-13 max-sm:gap-3 max-sm:rounded-[14px] max-sm:bg-card max-sm:px-4",
        className,
      )}
    >
      <SearchIcon aria-hidden="true" className="size-4 shrink-0 max-sm:size-5" />
      <input
        {...inputProps}
        type="search"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={onValueChange && ((event) => onValueChange(event.target.value))}
        className="min-w-0 flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground max-sm:text-[17px]"
      />
    </label>
  );
}
