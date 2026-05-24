import { styled, Text, YStack } from "tamagui";

export const Empty = styled(YStack, {
  name: "Empty",
  width: "100%",
  gap: "$4",
  p: "$6",
  rounded: "$6",
  borderWidth: 1,
  borderColor: "$borderColor",
  borderStyle: "dashed",
  items: "center",
  justify: "center",
});

export const EmptyHeader = styled(YStack, {
  name: "EmptyHeader",
  gap: "$2",
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
        rounded: "$4",
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
  fontSize: "$sm",
  fontWeight: "500",
});

export const EmptyDescription = styled(Text, {
  name: "EmptyDescription",
  fontSize: "$sm",
  color: "$color11",
});

export const EmptyContent = styled(YStack, {
  name: "EmptyContent",
  width: "100%",
  maxW: 320,
  gap: "$2",
  items: "center",
});
