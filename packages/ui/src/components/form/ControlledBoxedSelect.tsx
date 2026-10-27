import { Select as SelectPrimitive } from "@base-ui/react/select";
import { FieldBoxError, FieldBoxLabel } from "@repo/ui/components/FieldBox";
import { Select, SelectContent, SelectGroup, SelectItem } from "@repo/ui/components/Select";
import { fieldBoxClassName } from "@repo/ui/lib/field-styles";
import { cn } from "@repo/ui/lib/utils";
import { ChevronsUpDownIcon } from "lucide-react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

export type BoxedSelectOption = { value: string; label: string };

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

/** The whole box is the trigger; an unset value is stored as `undefined`. */
export function ControlledBoxedSelect<TFieldValues extends FieldValues = FieldValues>({
  label,
  options,
  placeholder = "Not set",
  className,
  ...controller
}: ControlledBoxedSelectProps<TFieldValues>) {
  return (
    <Controller
      {...controller}
      render={({ field, fieldState }) => (
        <div data-slot="field-box-field" className={cn("flex flex-col gap-1.5", className)}>
          <Select
            items={options}
            value={(field.value as string | undefined) ?? null}
            onValueChange={(value) => field.onChange(value ?? undefined)}
            disabled={field.disabled}
          >
            <SelectPrimitive.Trigger
              ref={field.ref}
              onBlur={field.onBlur}
              data-slot="field-box"
              data-invalid={fieldState.invalid}
              aria-invalid={fieldState.invalid}
              className={cn(fieldBoxClassName, "cursor-pointer select-none")}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <FieldBoxLabel>{label}</FieldBoxLabel>
                <SelectPrimitive.Value
                  placeholder={placeholder}
                  className="truncate font-medium text-base data-placeholder:font-normal data-placeholder:text-muted-foreground/70 md:text-[0.97rem]"
                />
              </span>
              <ChevronsUpDownIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
            </SelectPrimitive.Trigger>
            <SelectContent>
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {fieldState.invalid && <FieldBoxError error={fieldState.error} />}
        </div>
      )}
    />
  );
}
