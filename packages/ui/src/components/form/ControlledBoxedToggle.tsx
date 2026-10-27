import { FieldBox } from "@repo/ui/components/FieldBox";
import { Switch } from "@repo/ui/components/Switch";
import { type ReactNode, useId } from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

export type ControlledBoxedToggleProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  label: string;
  description?: ReactNode;
  className?: string;
} & Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, "render">;

export function ControlledBoxedToggle<TFieldValues extends FieldValues = FieldValues>({
  label,
  description,
  className,
  ...controller
}: ControlledBoxedToggleProps<TFieldValues>) {
  const id = useId();

  return (
    <Controller
      {...controller}
      render={({ field, fieldState }) => (
        <FieldBox
          label={label}
          htmlFor={id}
          description={description}
          invalid={fieldState.invalid}
          error={fieldState.error}
          className={className}
          trailing={
            // A native button, so `FormLock`'s `<fieldset disabled>` disables it too.
            <Switch
              nativeButton
              render={<button type="button" aria-label={label} />}
              data-slot="field-box-control"
              id={id}
              ref={field.ref}
              aria-invalid={fieldState.invalid}
              checked={Boolean(field.value)}
              onCheckedChange={(checked) => field.onChange(checked)}
              onBlur={field.onBlur}
              disabled={field.disabled}
              className="mr-2"
            />
          }
        />
      )}
    />
  );
}
