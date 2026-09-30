import { cva, type VariantProps } from "class-variance-authority";
import { type ReactNode } from "react";
import { Text, View, type ViewProps } from "react-native";

import { cn } from "../lib/utils";

const badgeVariants = cva(
  "h-5 flex-row items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        destructive: "border-destructive/30 bg-destructive/10 dark:bg-destructive/20",
        success: "border-success/35 bg-success/10 dark:border-strength-very-strong/35",
        warning: "border-warning/45 bg-warning/10 dark:border-warning/40",
        outline: "border-border",
        ghost: "bg-transparent",
        link: "bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const badgeTextVariants = cva("font-medium text-xs", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive",
      success: "text-[#047857] dark:text-strength-very-strong",
      warning: "text-[#b45309] dark:text-strength-strong",
      outline: "text-foreground",
      ghost: "text-foreground",
      link: "text-primary underline",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type BadgeProps = ViewProps &
  VariantProps<typeof badgeVariants> & {
    className?: string;
    children?: ReactNode;
  };

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      {typeof children === "string" ? (
        <Text className={cn(badgeTextVariants({ variant }))}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export { badgeTextVariants, badgeVariants };
