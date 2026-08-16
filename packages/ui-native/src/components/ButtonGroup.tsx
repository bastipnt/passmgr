import { cva, type VariantProps } from "class-variance-authority";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Text, type TextProps, View, type ViewProps } from "react-native";

import { cn } from "../lib/utils";

const buttonGroupVariants = cva("flex items-stretch self-start", {
  variants: {
    orientation: {
      horizontal: "flex-row",
      vertical: "flex-col",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

/**
 * Position classes injected into each child so the group reads as one control.
 *
 * React Native has no CSS sibling selectors (`[&>[data-slot]~[data-slot]]`), so
 * we clone children and collapse inner corners + shared borders by index.
 */
function seamClassName(
  orientation: "horizontal" | "vertical",
  isFirst: boolean,
  isLast: boolean,
): string {
  if (orientation === "vertical") {
    return cn(!isFirst && "rounded-t-none border-t-0", !isLast && "rounded-b-none");
  }
  return cn(!isFirst && "rounded-l-none border-l-0", !isLast && "rounded-r-none");
}

export type ButtonGroupProps = ViewProps &
  VariantProps<typeof buttonGroupVariants> & {
    className?: string;
    children?: ReactNode;
  };

function ButtonGroup({
  className,
  orientation = "horizontal",
  children,
  ...props
}: ButtonGroupProps) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{
    className?: string;
  }>[];
  const count = items.length;

  return (
    <View
      accessibilityRole="toolbar"
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    >
      {items.map((child, index) =>
        cloneElement(child, {
          className: cn(
            child.props.className,
            seamClassName(orientation ?? "horizontal", index === 0, index === count - 1),
          ),
        }),
      )}
    </View>
  );
}

export type ButtonGroupTextProps = TextProps & {
  className?: string;
};

/** Inline, non-interactive label rendered flush inside a ButtonGroup. */
function ButtonGroupText({ className, ...props }: ButtonGroupTextProps) {
  return (
    <Text
      className={cn(
        "self-center rounded-lg border border-border bg-muted px-[10px] py-[10px] font-medium text-muted-foreground text-sm",
        className,
      )}
      {...props}
    />
  );
}

export type ButtonGroupSeparatorProps = ViewProps &
  VariantProps<typeof buttonGroupVariants> & {
    className?: string;
  };

/** Thin divider between grouped items. Cross-platform (plain View, not swift-ui). */
function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: ButtonGroupSeparatorProps) {
  return (
    <View
      className={cn(
        "self-stretch bg-border",
        orientation === "vertical" ? "w-px" : "h-px",
        className,
      )}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
