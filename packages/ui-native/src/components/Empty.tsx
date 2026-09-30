import { cva, type VariantProps } from "class-variance-authority";
import { type ReactNode } from "react";
import { Text, type TextProps, View, type ViewProps } from "react-native";

import { cn } from "../lib/utils";

export function Empty({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View className={cn("w-full items-center justify-center gap-6 p-6", className)} {...props} />
  );
}

export function EmptyHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("max-w-[320px] items-center gap-2", className)} {...props} />;
}

const emptyMediaVariants = cva("items-center justify-center", {
  variants: {
    variant: {
      default: "bg-transparent",
      icon: "mb-2 h-12 w-12 rounded-2xl bg-primary",
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
  return (
    <Text
      className={cn(
        "text-center font-display-bold text-[24px] text-foreground tracking-[-0.5px]",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyDescription({ className, ...props }: TextProps & { className?: string }) {
  return (
    <Text
      className={cn("text-center text-muted-foreground text-sm leading-5", className)}
      {...props}
    />
  );
}

export function EmptyContent({
  className,
  children,
  ...props
}: ViewProps & { className?: string; children?: ReactNode }) {
  return (
    <View className={cn("w-full max-w-[320px] items-center gap-3", className)} {...props}>
      {children}
    </View>
  );
}
