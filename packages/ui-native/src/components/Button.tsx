import { type ReactNode } from "react";
import { Pressable, type PressableProps, Text } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const buttonVariants = cva(
  "flex-row shrink-0 items-center justify-center gap-sm rounded-lg border border-transparent px-[10px]",
  {
    variants: {
      variant: {
        default: "bg-primary",
        outline: "border-border bg-background",
        secondary: "bg-secondary",
        ghost: "bg-transparent",
        "ghost-destructive": "bg-transparent",
        destructive: "bg-destructive/20",
        link: "bg-transparent",
      },
      size: {
        default: "h-[40px]",
        lg: "h-[52px]",
        icon: "h-[40px] w-[40px] px-0",
        "icon-lg": "h-[52px] w-[52px] px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const buttonTextVariants = cva("text-sm font-semibold", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      outline: "text-foreground",
      secondary: "text-secondary-foreground",
      ghost: "text-foreground",
      "ghost-destructive": "text-destructive",
      destructive: "text-destructive",
      link: "text-primary underline",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type ButtonProps = Omit<PressableProps, "children"> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    /** Extra classes for the auto-wrapped text child. */
    textClassName?: string;
    /** Leading node (icon / spinner) rendered before the label. */
    icon?: ReactNode;
    children?: ReactNode;
  };

export function Button({
  className,
  textClassName,
  variant = "default",
  size = "default",
  icon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      className={cn(buttonVariants({ variant, size }), disabled && "opacity-50", className)}
      disabled={disabled}
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.85 } : null)}
      accessibilityRole="button"
      {...props}
    >
      {icon}
      {typeof children === "string" ? (
        <Text className={cn(buttonTextVariants({ variant }), textClassName)}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export { buttonVariants, buttonTextVariants };
