import { type ReactNode } from "react";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import { Text, TextInput, type TextInputProps, View } from "react-native";

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
    <View className="flex-auto gap-2">
      {label && !hideLabel && <Text className="font-bold text-foreground text-md">{label}</Text>}

      <TextInput
        multiline
        textAlignVertical="top"
        className={cn(
          "min-h-[104px] rounded-lg border-[1.5px] bg-background px-md py-md text-foreground text-md",
          error
            ? "border-destructive focus:border-destructive"
            : "border-border focus:border-primary",
        )}
        placeholderTextColorClassName="text-muted-foreground"
        {...rest}
      />

      {error && <Text className="text-destructive text-sm">{error}</Text>}

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
              <View className="shrink-0 pt-0.5 text-muted-foreground [&>svg]:size-4">{icon}</View>
              {fieldContent}
            </View>
          );
        }

        return fieldContent;
      }}
    />
  );
}
