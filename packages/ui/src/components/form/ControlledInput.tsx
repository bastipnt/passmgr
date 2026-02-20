import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Field, FieldError, FieldLabel } from "../Field";
import { Input } from "../Input";
import { useId } from "react";

type ControlledInputParams<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, "render"> & {
  label: string;
};

export function ControlledInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  control,
  label,
}: ControlledInputParams<TFieldValues>) {
  const id = useId();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input {...field} id={id} aria-invalid={fieldState.invalid} />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
