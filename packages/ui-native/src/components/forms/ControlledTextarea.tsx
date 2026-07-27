import { type ReactNode } from "react";
import { TextInput, type TextInputProps, View, Text } from "react-native";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { cn } from "../../lib/utils";

export type TextareaProps = TextInputProps & {
  label?: string;
  hideLabel?: boolean;
  error?: string;
  /** Rendered below the textarea — e.g. a hint or character count. */
  note?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function Textarea({
  label,
  hideLabel,
  error,
  note,
  className: _className,
  style: _style,
  ...rest
}: TextareaProps) {
  return (
    <View className="gap-2 flex-auto">
      {label && !hideLabel && <Text className="text-md font-bold text-foreground">{label}</Text>}

      <TextInput
        multiline
        textAlignVertical="top"
        className={cn(
          "min-h-[104px] rounded-lg border-[1.5px] bg-background px-md py-md text-md text-foreground",
          error
            ? "border-destructive focus:border-destructive"
            : "border-border focus:border-primary",
        )}
        placeholderTextColorClassName="text-muted-foreground"
        {...rest}
      />

      {error && <Text className="text-sm text-destructive">{error}</Text>}

      {note}
    </View>
  );
}

export type ControlledTextareaProps<TFieldValues extends FieldValues> = Omit<
  TextareaProps,
  "value" | "onChangeText" | "onBlur"
> & {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
};

export function ControlledTextarea<TFieldValues extends FieldValues>({
  control,
  name,
  icon,
  ...rest
}: ControlledTextareaProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldContent = (
          <Textarea
            value={(field.value as string | undefined) ?? ""}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            {...rest}
          />
        );

        if (icon) {
          return (
            <View className="flex-row items-start gap-2">
              <View className="text-muted-foreground [&>svg]:size-4 shrink-0 pt-0.5">{icon}</View>
              {fieldContent}
            </View>
          );
        }

        return fieldContent;
      }}
    />
  );
}
