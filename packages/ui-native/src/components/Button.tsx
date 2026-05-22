import type { ReactNode } from "react";
import { ActivityIndicator, type PressableProps } from "react-native";
import { colors } from "../theme/tokens";
import { cn } from "../lib/cn";
import { Pressable, Text, View } from "../lib/styled";

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
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={cn(
        "rounded-md py-3 px-4 min-h-[44] justify-center items-center",
        variant === "primary" && "bg-primary active:bg-primary-pressed",
        variant === "secondary" && "border border-border active:bg-muted",
        variant === "link" && "py-1 active:opacity-60",
        isDisabled && "opacity-50",
        className,
      )}
      {...rest}
    >
      <View className="flex-row items-center gap-2">
        {typeof children === "string" ? (
          <Text
            className={cn(
              "text-base font-semibold",
              variant === "primary" && "text-primary-foreground",
              variant === "secondary" && "text-foreground",
              variant === "link" && "text-primary font-medium",
            )}
          >
            {children}
          </Text>
        ) : (
          children
        )}
        {loading && (
          <ActivityIndicator
            size="small"
            color={variant === "primary" ? colors.light.primaryForeground : colors.light.primary}
          />
        )}
      </View>
    </Pressable>
  );
}
