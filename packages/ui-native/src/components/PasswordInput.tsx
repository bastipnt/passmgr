import { useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Pressable, Text, View } from "../lib/styled";
import { Input, type InputProps } from "./Input";

export type ControlledPasswordInputProps<TFieldValues extends FieldValues> = Omit<
  InputProps,
  "value" | "onChangeText" | "onBlur" | "secureTextEntry"
> & {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
};

export function ControlledPasswordInput<TFieldValues extends FieldValues>({
  control,
  name,
  ...rest
}: ControlledPasswordInputProps<TFieldValues>) {
  const [visible, setVisible] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <Input
              value={(field.value as string | undefined) ?? ""}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              secureTextEntry={!visible}
              autoCapitalize="none"
              autoCorrect={false}
              {...rest}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            onPress={() => setVisible((v) => !v)}
            className="px-2 py-3"
          >
            <Text className="text-sm text-primary font-medium">{visible ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>
      )}
    />
  );
}
