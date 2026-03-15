import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldError } from "../Field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@repo/ui/components/InputGroup";
import { useId } from "react";
import { cn } from "@repo/ui/lib/utils";

export type ControlledExtraFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TTitleName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TValueName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  titleName: TTitleName;
  valueName: TValueName;
};

export function ControlledExtraField<TFieldValues extends FieldValues = FieldValues>({
  control,
  titleName,
  valueName,
}: ControlledExtraFieldProps<TFieldValues>) {
  const id = useId();

  return (
    <Controller
      name={titleName}
      control={control}
      render={({ field: titleField, fieldState: titleState }) => (
        <Controller
          name={valueName}
          control={control}
          render={({ field: valueField, fieldState: valueState }) => {
            const isInvalid = titleState.invalid || valueState.invalid;
            return (
              <Field data-invalid={isInvalid} className="text-inherit!">
                <InputGroup>
                  <InputGroupAddon align="block-start">
                    <input
                      {...titleField}
                      data-slot="input-title"
                      className={cn(
                        "bg-transparent text-muted-foreground w-full border-none text-xs outline-none",
                        titleState.invalid && "text-destructive",
                      )}
                      placeholder="Field name"
                      aria-invalid={titleState.invalid}
                    />
                  </InputGroupAddon>
                  <InputGroupInput
                    {...valueField}
                    id={id}
                    className={cn(valueState.invalid && "text-destructive")}
                    aria-invalid={valueState.invalid}
                    autoComplete="off"
                    placeholder="Value"
                  />
                </InputGroup>
                {isInvalid && (
                  <FieldError errors={[titleState.error, valueState.error].filter(Boolean)} />
                )}
              </Field>
            );
          }}
        />
      )}
    />
  );
}
