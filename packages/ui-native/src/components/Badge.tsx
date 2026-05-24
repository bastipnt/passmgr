import { type ColorTokens, SizableText, styled, XStack, type XStackProps } from "tamagui";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";

const BadgeFrame = styled(XStack, {
  name: "Badge",
  height: 20,
  items: "center",
  justify: "center",
  gap: "$1",
  px: "$2",
  rounded: 9999,
  borderWidth: 1,
  borderColor: "transparent",
  overflow: "hidden",

  variants: {
    variant: {
      default: { bg: "$accent9" },
      secondary: { bg: "$color4" },
      destructive: { theme: "error", bg: "$color5" },
      outline: { borderColor: "$borderColor" },
      ghost: { bg: "transparent" },
      link: { bg: "transparent" },
    },
  } as const,

  defaultVariants: {
    variant: "default",
  },
});

const textColorMap: Record<BadgeVariant, ColorTokens> = {
  default: "$accent11",
  secondary: "$color12",
  destructive: "$color11",
  outline: "$color12",
  ghost: "$color11",
  link: "$accent10",
};

export function Badge({
  variant = "default",
  children,
  ...props
}: XStackProps & { variant?: BadgeVariant }) {
  return (
    <BadgeFrame variant={variant} {...props}>
      {typeof children === "string" ? (
        <SizableText
          size="$xs"
          fontWeight="500"
          color={textColorMap[variant]}
          textDecorationLine={variant === "link" ? "underline" : "none"}
        >
          {children}
        </SizableText>
      ) : (
        children
      )}
    </BadgeFrame>
  );
}
