import { styled, Text, YStack } from "tamagui";

export const Empty = styled(YStack, {
  name: "Empty",
  width: "100%",
  gap: "$lg",
  p: "$lg",
  rounded: "$lg",
  borderWidth: 1,
  borderColor: "$borderColor",
  borderStyle: "dashed",
  items: "center",
  justify: "center",
});

export const EmptyHeader = styled(YStack, {
  name: "EmptyHeader",
  gap: "$md",
  maxW: 320,
  items: "center",
});

export const EmptyMedia = styled(YStack, {
  name: "EmptyMedia",
  items: "center",
  justify: "center",

  variants: {
    variant: {
      default: { bg: "transparent" },
      icon: {
        width: 32,
        height: 32,
        rounded: "$lg",
        bg: "$color3",
      },
    },
  } as const,

  defaultVariants: {
    variant: "default",
  },
});

export const EmptyTitle = styled(Text, {
  name: "EmptyTitle",
  fontSize: "$md",
  fontWeight: "500",
});

export const EmptyDescription = styled(Text, {
  name: "EmptyDescription",
  fontSize: "$md",
  color: "$color11",
});

export const EmptyContent = styled(YStack, {
  name: "EmptyContent",
  width: "100%",
  maxW: 320,
  gap: "$md",
  items: "center",
});
