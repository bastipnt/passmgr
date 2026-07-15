import { type ReactNode } from "react";
import { TextInput, type TextInputProps, View, Text } from "react-native";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { cn } from "../../lib/utils";

export type InputProps = TextInputProps & {
  label?: string;
  error?: string;
  /** Rendered below the input — e.g. a strength meter or a "Forgot password?" link. */
  note?: ReactNode;
  /** Rendered at the trailing edge inside the field — e.g. a password eye toggle. */
  trailing?: ReactNode;
  className?: string;
};

export function Input({
  label,
  error,
  note,
  trailing,
  className: _className,
  style: _style,
  ...rest
}: InputProps) {
  return (
    <View className="gap-xs">
      {label && <Text className="text-md font-bold text-foreground">{label}</Text>}

      <View className="relative flex-row items-center">
        <TextInput
          className={cn(
            "h-[52px] flex-1 rounded-lg border-[1.5px] bg-background px-md text-md text-foreground",
            error
              ? "border-destructive focus:border-destructive"
              : "border-border focus:border-primary",
            trailing && "pr-[46px]",
          )}
          placeholderTextColorClassName="text-muted-foreground"
          {...rest}
        />
        {trailing && (
          <View className="absolute inset-y-0 right-[12px] items-center justify-center">
            {trailing}
          </View>
        )}
      </View>

      {error && <Text className="text-sm text-destructive">{error}</Text>}

      {note}
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
