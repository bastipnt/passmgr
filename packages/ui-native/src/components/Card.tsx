import type { ReactNode } from "react";
import { type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { Text, View } from "../lib/styled";

export function Card({ children, className, style, ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("bg-background rounded-lg border border-border p-4 gap-3", className)}
      style={style}
      {...rest}
    >
      {children}
    </View>
  );
}

export function CardHeader({
  children,
  className,
  style,
  ...rest
}: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("flex-row justify-between items-center", className)}
      style={style}
      {...rest}
    >
      {children}
    </View>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <Text className="text-xl font-bold text-text-primary">{children}</Text>;
}

export function CardAction({
  children,
  className,
  style,
  ...rest
}: ViewProps & { className?: string }) {
  return (
    <View className={cn("flex-row items-center gap-1", className)} style={style} {...rest}>
      {children}
    </View>
  );
}

export function CardContent({
  children,
  className,
  style,
  ...rest
}: ViewProps & { className?: string }) {
  return (
    <View className={cn("gap-3", className)} style={style} {...rest}>
      {children}
    </View>
  );
}

export function CardFooter({
  children,
  className,
  style,
  ...rest
}: ViewProps & { className?: string }) {
  return (
    <View className={cn("flex-row justify-end gap-3", className)} style={style} {...rest}>
      {children}
    </View>
  );
}
