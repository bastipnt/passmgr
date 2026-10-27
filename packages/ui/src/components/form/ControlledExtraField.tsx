import { FieldBox, FieldBoxButton, FieldBoxInput } from "@repo/ui/components/FieldBox";
import { maskedTextClassName } from "@repo/ui/lib/field-styles";
import { cn } from "@repo/ui/lib/utils";
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
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
                  <span className="flex items-center gap-1.5">
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
                    {secret && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-[0.6875rem] text-muted-foreground [&_svg]:size-2.75">
                        <LockIcon />
                        Hidden
                      </span>
                    )}
                  </span>
                }
                trailing={
                  <>
                    {secret && (
                      <FieldBoxButton
                        aria-label={revealed ? `Hide ${name}` : `Show ${name}`}
                        aria-pressed={revealed}
                        disabled={valueField.disabled}
                        onClick={() => setRevealed(!revealed)}
                      >
                        {revealed ? <EyeOffIcon /> : <EyeIcon />}
                      </FieldBoxButton>
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
