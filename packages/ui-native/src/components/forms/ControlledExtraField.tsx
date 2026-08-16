import { type ReactNode } from "react";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import { TextInput, View } from "react-native";

import { cn } from "../../lib/utils";
import { Field, FieldError } from "./Field";

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
              <Field data-invalid={isInvalid} className="flex-1">
                <View
                  className={cn(
                    "gap-xs rounded-lg border-[1.5px] bg-background px-md py-md",
                    isInvalid ? "border-destructive" : "border-border",
                  )}
                >
                  <TextInput
                    value={(titleField.value as string | undefined) ?? ""}
                    onChangeText={titleField.onChange}
                    onBlur={titleField.onBlur}
                    placeholder="Title"
                    placeholderTextColorClassName="text-muted-foreground"
                    className={cn(
                      "text-muted-foreground text-sm",
                      titleState.invalid && "text-destructive",
                    )}
                  />
                  <TextInput
                    value={(valueField.value as string | undefined) ?? ""}
                    onChangeText={valueField.onChange}
                    onBlur={valueField.onBlur}
                    placeholder="Value"
                    placeholderTextColorClassName="text-muted-foreground"
                    secureTextEntry={type === "secret"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className={cn(
                      "text-foreground text-md",
                      valueState.invalid && "text-destructive",
                    )}
                  />
                </View>

                {isInvalid && (
                  <FieldError errors={[titleState.error, valueState.error].filter(Boolean)} />
                )}
              </Field>
            );

            if (icon) {
              return (
                <View className="flex-1 flex-row items-start gap-2">
                  <View className="shrink-0 pt-3.5 [&>svg]:size-4">{icon}</View>
                  {fieldContent}
                </View>
              );
            }

            return fieldContent;
          }}
        />
      )}
    />
  );
}
