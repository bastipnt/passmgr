import { InputGroup, InputGroupAddon, InputGroupInput } from "@repo/ui/components/InputGroup";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";
import { useId } from "react";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import { Field, FieldError } from "../Field";

export type ControlledExtraFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TTitleName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TValueName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  titleName: TTitleName;
  valueName: TValueName;
  type?: "text" | "secret";
  icon?: ReactNode;
};

export function ControlledExtraField<TFieldValues extends FieldValues = FieldValues>({
  control,
  titleName,
  valueName,
  type = "text",
  icon,
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

            const fieldContent = (
              <Field data-invalid={isInvalid} className="text-inherit!">
                <InputGroup>
                  <InputGroupAddon align="block-start">
                    <input
                      {...titleField}
                      data-slot="input-title"
                      className={cn(
                        "w-full border-none bg-transparent text-muted-foreground text-xs outline-none",
                        titleState.invalid && "text-destructive",
                      )}
                      placeholder="Title"
                      aria-invalid={titleState.invalid}
                    />
                  </InputGroupAddon>
                  <InputGroupInput
                    {...valueField}
                    id={id}
                    className={cn(
                      valueState.invalid && "text-destructive placeholder:text-destructive",
                      type === "secret" &&
                        "[-webkit-text-security:disc] focus:[-webkit-text-security:none]",
                    )}
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

            if (icon) {
              return (
                <div className="flex flex-1 items-start gap-2">
                  <span className="shrink-0 pt-0.5 text-muted-foreground [&>svg]:size-4">
                    {icon}
                  </span>
                  {fieldContent}
                </div>
              );
            }

            return fieldContent;
          }}
        />
      )}
    />
  );
}
