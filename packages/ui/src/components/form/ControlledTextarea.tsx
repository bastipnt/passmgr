import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Field, FieldError, FieldLabel } from "../Field";
import { Textarea } from "../Textarea";
import { useId } from "react";

export type ControlledTextareaParams<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  label: string;
  hideLabel?: boolean;
} & Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, "render"> &
  React.ComponentProps<"textarea">;

export function ControlledTextarea<TFieldValues extends FieldValues = FieldValues>({
  name,
  control,
  label,
  hideLabel = false,
  ...props
}: ControlledTextareaParams<TFieldValues>) {
  const id = useId();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {!hideLabel && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
          <Textarea {...field} id={id} aria-invalid={fieldState.invalid} {...props} />

          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
