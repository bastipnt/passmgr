import { useState } from "react";
import { Pressable } from "react-native";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react-native";
import { useCSSVariable } from "uniwind";
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
  const iconColor = useCSSVariable("--color-muted-foreground") as string;

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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={visible ? "Hide password" : "Show password"}
              hitSlop={8}
              className="p-xs"
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
              onPress={() => setVisible((v) => !v)}
            >
              <Icon size={20} color={iconColor} />
            </Pressable>
          }
          {...rest}
        />
      )}
    />
  );
}
