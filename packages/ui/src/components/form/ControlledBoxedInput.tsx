import {
  FieldBox,
  FieldBoxButton,
  FieldBoxInput,
  FieldBoxRevealButton,
} from "@repo/ui/components/FieldBox";
import { maskedTextClassName } from "@repo/ui/lib/field-styles";
import { cn, mergeRefs } from "@repo/ui/lib/utils";
import { CalendarIcon } from "lucide-react";
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
  /** Shown in place of `label` where space is tight; `label` stays the accessible name. */
  visibleLabel?: string;
  /** The label for assistive tech only. */
  hideLabel?: boolean;
  /** After the visible label, on its line (a card's network); `label` stays the accessible name. */
  labelSuffix?: ReactNode;
  mono?: boolean;
  /** Masked until focused or shown with the eye button; no `type="password"`. */
  secret?: boolean;
  /** Before the label (a drag handle, an icon). */
  leading?: ReactNode;
  /** After the eye / calendar button. */
  trailing?: ReactNode;
  size?: "default" | "sm";
  /** Under the box while there is no error. */
  hint?: ReactNode;
  /** On the box's wrapper (grid placement), not the input. */
  className?: string;
} & Omit<ControllerProps<TFieldValues, TName, TTransformedValues>, "render"> &
  Omit<
    ComponentProps<"input">,
    "name" | "defaultValue" | "className" | "id" | "aria-invalid" | "size"
  >;

export function ControlledBoxedInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  control,
  rules,
  shouldUnregister,
  defaultValue,
  disabled,
  label,
  visibleLabel,
  hideLabel,
  labelSuffix,
  mono = false,
  secret = false,
  leading,
  trailing,
  size,
  hint,
  type,
  className,
  ref,
  value,
  onBlur,
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
          label={
            labelSuffix ? (
              <>
                {visibleLabel ?? label}
                {labelSuffix}
              </>
            ) : (
              (visibleLabel ?? label)
            )
          }
          hideLabel={hideLabel}
          htmlFor={id}
          invalid={fieldState.invalid}
          error={fieldState.error}
          hint={hint}
          className={className}
          size={size}
          leading={leading}
          trailing={
            <>
              {secret && (
                <FieldBoxRevealButton
                  name={lowerLabel}
                  revealed={revealed}
                  onRevealedChange={setRevealed}
                  disabled={field.disabled}
                />
              )}
              {type === "date" && (
                // Firefox draws its own calendar button in the input and has no way
                // to hide it: leave the picker to it there.
                <FieldBoxButton
                  aria-label={`Pick ${lowerLabel}`}
                  className="supports-[-moz-appearance:none]:hidden"
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
            aria-label={visibleLabel || labelSuffix ? label : undefined}
            type={type}
            aria-invalid={fieldState.invalid}
            onBlur={(event) => {
              field.onBlur();
              onBlur?.(event);
            }}
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
