import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Field, FieldError, FieldLabel } from "../Field";
import { Textarea } from "../Textarea";
import { useId, type ReactNode } from "react";

export type ControlledTextareaParams<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  label: string;
  icon?: ReactNode;
  hideLabel?: boolean;
} & Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, "render"> &
  React.ComponentProps<"textarea">;

export function ControlledTextarea<TFieldValues extends FieldValues = FieldValues>({
  name,
  control,
  label,
  icon,
  hideLabel = false,
  ...props
}: ControlledTextareaParams<TFieldValues>) {
  const id = useId();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const fieldContent = (
          <Field data-invalid={fieldState.invalid}>
            {!hideLabel && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
            <Textarea {...field} id={id} aria-invalid={fieldState.invalid} {...props} />

            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        );

        if (icon) {
          return (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground [&>svg]:size-4 shrink-0 pt-0.5">{icon}</span>
              {fieldContent}
            </div>
          );
        }

        return fieldContent;
      }}
    />
  );
}
