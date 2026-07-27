import { useState } from "react";
import { Pressable, View } from "react-native";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react-native";
import { useCSSVariable } from "uniwind";
import { Input, type InputProps } from "./ControlledInput";

export type ControlledPasswordInputProps<TFieldValues extends FieldValues> = Omit<
  InputProps,
  "value" | "onChangeText" | "onBlur" | "secureTextEntry" | "addon"
> & {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
};

export function ControlledPasswordInput<TFieldValues extends FieldValues>({
  control,
  name,
  icon,
  ...rest
}: ControlledPasswordInputProps<TFieldValues>) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  const iconColor = useCSSVariable("--color-muted-foreground") as string;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldContent = (
          <Input
            value={(field.value as string | undefined) ?? ""}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoCorrect={false}
            addon={
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
        );

        if (icon) {
          return (
            <View className="items-start gap-2 flex-row">
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
