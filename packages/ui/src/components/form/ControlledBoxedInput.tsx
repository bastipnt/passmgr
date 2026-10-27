import { FieldBox, FieldBoxButton, FieldBoxInput } from "@repo/ui/components/FieldBox";
import { maskedTextClassName } from "@repo/ui/lib/field-styles";
import { cn, mergeRefs } from "@repo/ui/lib/utils";
import { CalendarIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useId, useRef, useState } from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

export type ControlledBoxedInputProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
> = {
  label: string;
  mono?: boolean;
  /** Masked until focused or shown with the eye button; no `type="password"`. */
  secret?: boolean;
  /** After the eye / calendar button. */
  trailing?: ReactNode;
  /** Under the box while there is no error. */
  hint?: ReactNode;
  /** On the box's wrapper (grid placement), not the input. */
  className?: string;
} & Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, "render"> &
  Omit<ComponentProps<"input">, "name" | "defaultValue" | "className" | "id" | "aria-invalid">;

export function ControlledBoxedInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  control,
  rules,
  shouldUnregister,
  defaultValue,
  disabled,
  label,
  mono = false,
  secret = false,
  trailing,
  hint,
  type,
  className,
  ref,
  value,
  ...props
}: ControlledBoxedInputProps<TFieldValues>) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const lowerLabel = label.toLowerCase();

  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      shouldUnregister={shouldUnregister}
      defaultValue={defaultValue}
      disabled={disabled}
      render={({ field, fieldState }) => (
        <FieldBox
          label={label}
          htmlFor={id}
          invalid={fieldState.invalid}
          error={fieldState.error}
          hint={hint}
          className={className}
          trailing={
            <>
              {secret && (
                <FieldBoxButton
                  aria-label={revealed ? `Hide ${lowerLabel}` : `Show ${lowerLabel}`}
                  aria-pressed={revealed}
                  disabled={field.disabled}
                  onClick={() => setRevealed(!revealed)}
                >
                  {revealed ? <EyeOffIcon /> : <EyeIcon />}
                </FieldBoxButton>
              )}
              {type === "date" && (
                <FieldBoxButton
                  aria-label={`Pick ${lowerLabel}`}
                  disabled={field.disabled}
                  onClick={() => inputRef.current?.showPicker()}
                >
                  <CalendarIcon />
                </FieldBoxButton>
              )}
              {trailing}
            </>
          }
        >
          {/* An optional field starts `undefined`: render it as empty, so the
              input stays controlled from the start. */}
          <FieldBoxInput
            {...field}
            ref={mergeRefs(field.ref, inputRef, ref)}
            value={value ?? field.value ?? ""}
            id={id}
            type={type}
            aria-invalid={fieldState.invalid}
            className={cn(
              (mono || secret) && "font-mono placeholder:font-sans",
              secret && !revealed && maskedTextClassName,
              type === "date" &&
                "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-datetime-edit]:p-0",
            )}
            {...props}
          />
        </FieldBox>
      )}
    />
  );
}
