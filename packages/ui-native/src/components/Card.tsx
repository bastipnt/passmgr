import { type ReactNode } from "react";
import { Text, View, type ViewProps } from "react-native";

import { cn } from "../lib/utils";

type CardSlotProps = ViewProps & { className?: string; children?: ReactNode };

export function Card({ className, children, ...props }: CardSlotProps) {
  return (
    <View
      className={cn("gap-sm rounded-xl border border-border bg-card p-sm", className)}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({ className, children, ...props }: CardSlotProps) {
  return (
    <View className={cn("flex-row items-center justify-between gap-md", className)} {...props}>
      {children}
    </View>
  );
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Text className={cn("flex-1 font-bold text-card-foreground text-lg", className)}>
      {children}
    </Text>
  );
}

export function CardAction({ className, children, ...props }: CardSlotProps) {
  return (
    <View className={cn("flex-row items-center gap-md", className)} {...props}>
      {children}
    </View>
  );
}

export function CardContent({ className, children, ...props }: CardSlotProps) {
  return (
    <View className={cn("gap-md p-md", className)} {...props}>
      {children}
    </View>
  );
}

export function CardFooter({ className, children, ...props }: CardSlotProps) {
  return (
    <View className={cn("flex-1 flex-row justify-end gap-md p-md", className)} {...props}>
      {children}
    </View>
  );
}
