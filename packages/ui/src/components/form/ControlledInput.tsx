import { InputGroup, InputGroupAddon, InputGroupInput } from "@repo/ui/components/InputGroup";
import { isDefined } from "@repo/util";
import { type ReactNode, useId } from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Field, FieldError, FieldLabel } from "../Field";
import { Input } from "../Input";

export type ControlledInputParams<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  label: string;
  /** Rendered outside the field, left of it. */
  icon?: ReactNode;
  /** Rendered inside the input, before the text. */
  leadingIcon?: ReactNode;
  addon?: ReactNode;
  /** Right-aligned on the label row, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
  /** Below the input, above the validation error, e.g. a strength meter. */
  hint?: ReactNode;
  hideLabel?: boolean;
} & Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, "render"> &
  React.ComponentProps<"input">;

export function ControlledInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  control,
  label,
  icon,
  leadingIcon,
  addon,
  labelAction,
  hint,
  hideLabel = false,
  ...props
}: ControlledInputParams<TFieldValues>) {
  const id = useId();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        // An optional field starts `undefined`: render it as empty, so the
        // input stays controlled from the start (no React warning on typing).
        const fieldContent = (
          <Field data-invalid={fieldState.invalid}>
            {!hideLabel &&
              (isDefined(labelAction) ? (
                <div className="flex items-baseline justify-between gap-2">
                  <FieldLabel htmlFor={id}>{label}</FieldLabel>
                  {labelAction}
                </div>
              ) : (
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
              ))}
            {isDefined(addon) || isDefined(leadingIcon) ? (
              <InputGroup>
                {isDefined(leadingIcon) && (
                  <InputGroupAddon align="inline-start">{leadingIcon}</InputGroupAddon>
                )}
                <InputGroupInput
                  {...field}
                  value={field.value ?? ""}
                  id={id}
                  aria-invalid={fieldState.invalid}
                  {...props}
                />
                {addon}
              </InputGroup>
            ) : (
              <Input
                {...field}
                value={field.value ?? ""}
                id={id}
                aria-invalid={fieldState.invalid}
                {...props}
              />
            )}
            {hint}

            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        );

        if (icon) {
          return (
            <div className="flex items-start gap-2">
              <span className="shrink-0 pt-0.5 text-muted-foreground [&>svg]:size-4">{icon}</span>
              {fieldContent}
            </div>
          );
        }

        return fieldContent;
      }}
    />
  );
}
