import { useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { XStack, YStack } from "tamagui";
import { Input, type InputProps } from "./Input";
import { Button } from "../Button";

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
        <XStack items="flex-end" gap="$4">
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
          <Button
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            onPress={() => setVisible((v) => !v)}
            variant="outlined"
          >
            {visible ? "Hide" : "Show"}
          </Button>
        </XStack>
      )}
    />
  );
}
