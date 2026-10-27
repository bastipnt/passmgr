import { FieldBoxError } from "@repo/ui/components/FieldBox";
import { TagInput } from "@repo/ui/components/TagInput";
import { cn } from "@repo/ui/lib/utils";
import { useId } from "react";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
  type FieldError as FormFieldError,
} from "react-hook-form";

type ControlledTagInputProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  suggestions: readonly string[];
  maxLength?: number;
  /** On the field's wrapper (grid placement). */
  className?: string;
};

/** A tag list's error sits on the list, or (one bad tag) on that tag. */
function firstError(error: unknown): FormFieldError | undefined {
  if (!error) return undefined;
  if (Array.isArray(error)) return error.find(Boolean) as FormFieldError | undefined;
  return error as FormFieldError;
}

export function ControlledTagInput<TFieldValues extends FieldValues = FieldValues>({
  control,
  name,
  label,
  suggestions,
  maxLength,
  className,
}: ControlledTagInputProps<TFieldValues>) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = firstError(fieldState.error);
        return (
          <div data-slot="field-box-field" className={cn("flex flex-col gap-1.5", className)}>
            <TagInput
              id={id}
              label={label}
              value={(field.value as string[] | undefined) ?? []}
              onChange={field.onChange}
              onBlur={field.onBlur}
              suggestions={suggestions}
              maxLength={maxLength}
              disabled={field.disabled}
              aria-invalid={!!error}
            />
            {error && <FieldBoxError error={error} />}
          </div>
        );
      }}
    />
  );
}
