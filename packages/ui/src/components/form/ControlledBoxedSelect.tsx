import { Select as SelectPrimitive } from "@base-ui/react/select";
import { FieldBoxError, FieldBoxLabel } from "@repo/ui/components/FieldBox";
import { Select, SelectContent, SelectGroup, SelectItem } from "@repo/ui/components/Select";
import { fieldBoxClassName } from "@repo/ui/lib/field-styles";
import { cn } from "@repo/ui/lib/utils";
import { ChevronsUpDownIcon } from "lucide-react";
import { type ReactNode, type Ref, useId } from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

export type BoxedSelectOption = { value: string; label: string };

type BoxedSelectProps = {
  label: string;
  options: readonly BoxedSelectOption[];
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
  /** Draws an option, in the list and as the value; the label alone by default. */
  renderOption?: (option: BoxedSelectOption) => ReactNode;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  error?: { message?: string };
  onBlur?: () => void;
  ref?: Ref<HTMLButtonElement>;
  className?: string;
};

/** The whole box is the trigger. */
export function BoxedSelect({
  label,
  options,
  value,
  onValueChange,
  renderOption = (option) => option.label,
  placeholder = "Not set",
  disabled,
  invalid = false,
  error,
  onBlur,
  ref,
  className,
}: BoxedSelectProps) {
  const labelId = useId();
  const selected = options.find((option) => option.value === value);

  return (
    <div data-slot="field-box-field" className={cn("flex flex-col gap-1.5", className)}>
      <Select
        items={options}
        value={value ?? null}
        onValueChange={(next) => onValueChange((next as string | null) ?? undefined)}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          ref={ref}
          onBlur={onBlur}
          data-slot="field-box"
          data-invalid={invalid}
          aria-invalid={invalid}
          aria-labelledby={labelId}
          className={cn(fieldBoxClassName, "cursor-pointer select-none")}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <FieldBoxLabel id={labelId}>{label}</FieldBoxLabel>
            <SelectPrimitive.Value
              placeholder={placeholder}
              className="flex min-w-0 items-center gap-2 truncate font-medium text-base data-placeholder:font-normal data-placeholder:text-muted-foreground md:text-[0.97rem]"
            >
              {selected ? () => renderOption(selected) : undefined}
            </SelectPrimitive.Value>
          </span>
          <ChevronsUpDownIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Trigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {renderOption(option)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {invalid && <FieldBoxError error={error} />}
    </div>
  );
}

export type ControlledBoxedSelectProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  label: string;
  options: readonly BoxedSelectOption[];
  placeholder?: string;
  className?: string;
} & Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, "render">;

/** An unset value is stored as `undefined`. */
export function ControlledBoxedSelect<TFieldValues extends FieldValues = FieldValues>({
  label,
  options,
  placeholder,
  className,
  ...controller
}: ControlledBoxedSelectProps<TFieldValues>) {
  return (
    <Controller
      {...controller}
      render={({ field, fieldState }) => (
        <BoxedSelect
          label={label}
          options={options}
          placeholder={placeholder}
          className={className}
          value={field.value as string | undefined}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          disabled={field.disabled}
          invalid={fieldState.invalid}
          error={fieldState.error}
        />
      )}
    />
  );
}
