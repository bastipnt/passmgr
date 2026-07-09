import { useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Eye, EyeOff } from "@tamagui/lucide-icons-2";
import { View } from "tamagui";
import { Input, type InputProps } from "./Input";

export type ControlledPasswordInputProps<TFieldValues extends FieldValues> = Omit<
  InputProps,
  "value" | "onChangeText" | "onBlur" | "secureTextEntry" | "trailing"
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
  const Icon = visible ? EyeOff : Eye;

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
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          trailing={
            <View
              accessibilityRole="button"
              accessibilityLabel={visible ? "Hide password" : "Show password"}
              hitSlop={8}
              p="$xs"
              onPress={() => setVisible((v) => !v)}
              pressStyle={{ opacity: 0.6 }}
            >
              <Icon size={20} color="$color005" />
            </View>
          }
          {...rest}
        />
      )}
    />
  );
}
