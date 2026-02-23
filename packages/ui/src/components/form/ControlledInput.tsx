import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Field, FieldError, FieldLabel } from "../Field";
import { Input } from "../Input";
import { useId, type ReactNode } from "react";
import { isDefined } from "@repo/util";
import { InputGroup, InputGroupInput } from "@repo/ui/components/InputGroup";

export type ControlledInputParams<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  label: string;
  addon?: ReactNode;
  hideLabel?: boolean;
} & Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, "render"> &
  React.ComponentProps<"input">;

export function ControlledInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  control,
  label,
  addon,
  hideLabel = false,
  ...props
}: ControlledInputParams<TFieldValues>) {
  const id = useId();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {!hideLabel && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
          {isDefined(addon) ? (
            <InputGroup>
              <InputGroupInput {...field} id={id} aria-invalid={fieldState.invalid} {...props} />
              {addon}
            </InputGroup>
          ) : (
            <Input {...field} id={id} aria-invalid={fieldState.invalid} {...props} />
          )}

          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
