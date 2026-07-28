import { type ReactNode } from "react";
import { View, type ViewProps, Text, type TextProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

export function Empty({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn(
        "w-full items-center justify-center gap-lg rounded-lg border border-dashed border-border p-lg",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("max-w-[320px] items-center gap-md", className)} {...props} />;
}

const emptyMediaVariants = cva("items-center justify-center", {
  variants: {
    variant: {
      default: "bg-transparent",
      icon: "h-[32px] w-[32px] rounded-lg bg-muted",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export function EmptyMedia({
  className,
  variant = "default",
  ...props
}: ViewProps & { className?: string } & VariantProps<typeof emptyMediaVariants>) {
  return <View className={cn(emptyMediaVariants({ variant }), className)} {...props} />;
}

export function EmptyTitle({ className, ...props }: TextProps & { className?: string }) {
  return <Text className={cn("text-foreground text-md font-medium", className)} {...props} />;
}

export function EmptyDescription({ className, ...props }: TextProps & { className?: string }) {
  return <Text className={cn("text-md text-muted-foreground", className)} {...props} />;
}

export function EmptyContent({
  className,
  children,
  ...props
}: ViewProps & { className?: string; children?: ReactNode }) {
  return (
    <View className={cn("w-full max-w-[320px] items-center gap-md", className)} {...props}>
      {children}
    </View>
  );
}
