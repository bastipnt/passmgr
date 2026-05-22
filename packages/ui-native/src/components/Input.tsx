import { useState } from "react";
import { type TextInputProps } from "react-native";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { cn } from "../lib/cn";
import { Text, TextInput, View } from "../lib/styled";

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  className?: string;
};

export function Input({ label, error, className, style, onFocus, onBlur, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className="gap-1">
      {label && <Text className="text-sm font-medium text-foreground">{label}</Text>}
      <TextInput
        placeholderTextColor="#9ca3af"
        className={cn(
          "border border-border rounded-md px-3 py-2 min-h-[44] text-base text-foreground bg-background",
          focused && "border-ring",
          error && "border-destructive",
          className,
        )}
        style={style}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {error && <Text className="text-xs text-destructive">{error}</Text>}
    </View>
  );
}

export type ControlledInputProps<TFieldValues extends FieldValues> = Omit<
  InputProps,
  "value" | "onChangeText" | "onBlur"
> & {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
};

export function ControlledInput<TFieldValues extends FieldValues>({
  control,
  name,
  ...rest
}: ControlledInputProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          value={(field.value as string | undefined) ?? ""}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
          {...rest}
        />
      )}
    />
  );
}
