import { useId } from "react";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
  type FieldError as FormFieldError,
} from "react-hook-form";
import { Field, FieldError, FieldLabel } from "../Field";
import { TagInput } from "../TagInput";

type ControlledTagInputProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  suggestions: readonly string[];
  maxLength?: number;
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
}: ControlledTagInputProps<TFieldValues>) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const error = firstError(fieldState.error);
        return (
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <TagInput
              id={id}
              value={(field.value as string[] | undefined) ?? []}
              onChange={field.onChange}
              onBlur={field.onBlur}
              suggestions={suggestions}
              maxLength={maxLength}
              disabled={field.disabled}
              aria-invalid={!!error}
            />
            {error && <FieldError errors={[error]} />}
          </Field>
        );
      }}
    />
  );
}
