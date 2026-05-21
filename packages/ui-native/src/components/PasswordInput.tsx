import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { Input, type InputProps } from "./Input";
import { colors, fontSize, spacing } from "../theme/tokens";

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
        <View style={styles.row}>
          <View style={styles.input}>
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
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>{visible ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
  },
  toggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  toggleText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: "500",
  },
});
