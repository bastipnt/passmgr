import { ResponsiveSheet, SheetDrawerHeader } from "@repo/ui/complex-components/ResponsiveSheet";
import { ListRow } from "@repo/ui/components/ListRow";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectValue,
} from "@repo/ui/components/Select";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { CheckIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { SettingsRow, SettingsRowButton, SettingsSelectTrigger } from "./SettingsRow";

export type SettingsChoice<T extends string | number> = { value: T; label: string };

type SettingsChoiceRowProps<T extends string | number> = {
  label: string;
  /** Under the label on desktop; a phone row shows `phoneHint` only (its group's footnote says the rest). */
  hint?: ReactNode;
  phoneHint?: ReactNode;
  choices: readonly SettingsChoice<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** The phone row's shorter value ("15 minutes" for "After 15 minutes"). */
  shortLabel?: (label: string) => string;
  disabled?: boolean;
};

/**
 * One setting picked from a few choices: a select on desktop; on a phone a
 * drill-down row with the current value that opens the choices in a sheet.
 */
export function SettingsChoiceRow<T extends string | number>({
  label,
  hint,
  phoneHint,
  choices,
  value,
  onValueChange,
  shortLabel = (text) => text,
  disabled = false,
}: SettingsChoiceRowProps<T>) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const current = choices.find((choice) => choice.value === value);

  if (isMobile)
    return (
      <>
        <SettingsRowButton
          label={label}
          hint={phoneHint}
          value={current && shortLabel(current.label)}
          chevron={!disabled}
          disabled={disabled}
          onClick={() => setOpen(true)}
        />
        <ResponsiveSheet
          open={open}
          onOpenChange={setOpen}
          title={label}
          actions={<SheetDrawerHeader title={label} />}
        >
          <div className="flex flex-col">
            {choices.map((choice) => {
              const selected = choice.value === value;
              return (
                <ListRow
                  key={choice.value}
                  media={null}
                  title={choice.label}
                  active={selected}
                  aria-pressed={selected}
                  trailing={
                    selected && (
                      <CheckIcon aria-hidden="true" className="size-4 text-primary-text" />
                    )
                  }
                  onClick={() => {
                    onValueChange(choice.value);
                    setOpen(false);
                  }}
                />
              );
            })}
          </div>
        </ResponsiveSheet>
      </>
    );

  return (
    <SettingsRow
      label={label}
      hint={hint}
      control={
        <Select
          items={choices}
          value={value}
          disabled={disabled}
          onValueChange={(next) => onValueChange(next as T)}
        >
          <SettingsSelectTrigger>
            <SelectValue />
          </SettingsSelectTrigger>
          <SelectContent>
            <SelectGroup>
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      }
    />
  );
}
