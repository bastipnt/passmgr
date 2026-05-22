import { useState } from "react";
import { Pressable } from "react-native";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Text, XStack, YStack } from "tamagui";
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
        <XStack alignItems="flex-end" gap="$sm">
          <YStack flex={1}>
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
          </YStack>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            onPress={() => setVisible((v) => !v)}
            style={{ paddingHorizontal: 8, paddingVertical: 12 }}
          >
            <Text fontSize="$sm" color="$primary" fontWeight="500">
              {visible ? "Hide" : "Show"}
            </Text>
          </Pressable>
        </XStack>
      )}
    />
  );
}
