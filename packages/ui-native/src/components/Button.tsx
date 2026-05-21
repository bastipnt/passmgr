import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";
import { colors, fontSize, radius, spacing } from "../theme/tokens";

type Variant = "primary" | "secondary" | "link";

export type ButtonProps = Omit<PressableProps, "children"> & {
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
};

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        variantStyles[variant].container,
        state.pressed && variantStyles[variant].pressed,
        isDisabled && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
      {...rest}
    >
      <View style={styles.inner}>
        {typeof children === "string" ? (
          <Text style={[styles.label, variantStyles[variant].label]}>{children}</Text>
        ) : (
          children
        )}
        {loading && (
          <ActivityIndicator
            size="small"
            color={variant === "primary" ? colors.textInverse : colors.primary}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantStyles: Record<Variant, { container: object; pressed: object; label: object }> = {
  primary: {
    container: { backgroundColor: colors.primary },
    pressed: { backgroundColor: colors.primaryPressed },
    label: { color: colors.textInverse },
  },
  secondary: {
    container: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: { backgroundColor: colors.surface },
    label: { color: colors.textPrimary },
  },
  link: {
    container: { backgroundColor: "transparent", paddingVertical: spacing.xs },
    pressed: { opacity: 0.6 },
    label: { color: colors.primary, fontWeight: "500" },
  },
};
