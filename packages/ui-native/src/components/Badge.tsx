import { type ReactNode } from "react";
import { View, type ViewProps, Text } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const badgeVariants = cva(
  "h-[20px] flex-row items-center justify-center gap-md rounded-full border border-transparent px-md overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        destructive: "bg-destructive/10",
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

const badgeTextVariants = cva("text-xs font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      destructive: "text-destructive",
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

export { badgeVariants, badgeTextVariants };
