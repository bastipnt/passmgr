import type { ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";
import { Spinner, Text, XStack } from "tamagui";

type Variant = "primary" | "secondary" | "link";

export type ButtonProps = Omit<PressableProps, "children"> & {
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
  className?: string;
};

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled,
  className: _className,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable accessibilityRole="button" disabled={isDisabled} style={style} {...rest}>
      {({ pressed }) => {
        const backgroundColor =
          variant === "primary"
            ? pressed
              ? "$primaryPressed"
              : "$primary"
            : variant === "secondary" && pressed
              ? "$muted"
              : "transparent";

        const textColor =
          variant === "primary"
            ? "$primaryForeground"
            : variant === "link"
              ? "$primary"
              : "$foreground";

        const opacity = isDisabled ? 0.5 : variant === "link" && pressed ? 0.6 : 1;

        return (
          <XStack
            alignItems="center"
            justifyContent="center"
            gap="$sm"
            borderRadius="$md"
            paddingVertical={variant === "link" ? "$xs" : "$md"}
            paddingHorizontal={variant === "link" ? 0 : "$lg"}
            minHeight={variant === "link" ? undefined : 44}
            backgroundColor={backgroundColor}
            borderColor={variant === "secondary" ? "$border" : undefined}
            borderWidth={variant === "secondary" ? 1 : 0}
            opacity={opacity}
          >
            {typeof children === "string" ? (
              <Text
                fontSize="$md"
                fontWeight={variant === "link" ? "500" : "600"}
                color={textColor}
              >
                {children}
              </Text>
            ) : (
              children
            )}
            {loading && (
              <Spinner
                size="small"
                color={variant === "primary" ? "$primaryForeground" : "$primary"}
              />
            )}
          </XStack>
        );
      }}
    </Pressable>
  );
}
