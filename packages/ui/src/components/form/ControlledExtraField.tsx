import {
  FieldBox,
  FieldBoxHiddenMarker,
  FieldBoxInput,
  FieldBoxRevealButton,
} from "@repo/ui/components/FieldBox";
import { maskedTextClassName } from "@repo/ui/lib/field-styles";
import { cn } from "@repo/ui/lib/utils";
import { type ReactNode, useId, useState } from "react";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";

export type ControlledExtraFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TTitleName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TValueName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  titleName: TTitleName;
  valueName: TValueName;
  /** `secret`: masked until shown with the eye button, marked "Hidden". */
  type?: "text" | "secret";
  /** Before the label (a drag handle). */
  leading?: ReactNode;
  /** After the eye button. */
  trailing?: ReactNode;
};

/** A user-named field in a box: the editable label inside at the top, the value under it. */
export function ControlledExtraField<TFieldValues extends FieldValues = FieldValues>({
  control,
  titleName,
  valueName,
  type = "text",
  leading,
  trailing,
}: ControlledExtraFieldProps<TFieldValues>) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const secret = type === "secret";

  return (
    <Controller
      name={titleName}
      control={control}
      render={({ field: titleField, fieldState: titleState }) => (
        <Controller
          name={valueName}
          control={control}
          render={({ field: valueField, fieldState: valueState }) => {
            const name = titleField.value || "field";

            return (
              <FieldBox
                htmlFor={id}
                invalid={titleState.invalid || valueState.invalid}
                error={titleState.error ?? valueState.error}
                leading={leading}
                label={
                  // The label input grows with its text (`field-sizing-content`); without
                  // the containment that width pushes the whole form wider than the screen.
                  <span className="flex contain-inline-size items-center gap-1.5">
                    <input
                      {...titleField}
                      value={titleField.value ?? ""}
                      data-slot="field-box-control"
                      aria-label="Field label"
                      aria-invalid={titleState.invalid}
                      autoComplete="off"
                      placeholder="Label"
                      className="field-sizing-content min-w-12 max-w-full bg-transparent p-0 outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
                    />
                    {secret && <FieldBoxHiddenMarker />}
                  </span>
                }
                trailing={
                  <>
                    {secret && (
                      <FieldBoxRevealButton
                        name={name}
                        revealed={revealed}
                        onRevealedChange={setRevealed}
                        disabled={valueField.disabled}
                      />
                    )}
                    {trailing}
                  </>
                }
              >
                <FieldBoxInput
                  {...valueField}
                  value={valueField.value ?? ""}
                  id={id}
                  aria-invalid={valueState.invalid}
                  autoComplete="off"
                  placeholder="Value"
                  className={cn(secret && "font-mono", secret && !revealed && maskedTextClassName)}
                />
              </FieldBox>
            );
          }}
        />
      )}
    />
  );
}
