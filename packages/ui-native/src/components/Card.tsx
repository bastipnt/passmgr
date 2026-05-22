import type { ReactNode } from "react";
import { type ViewProps } from "react-native";
import { Text, XStack, YStack } from "tamagui";

type CardSlotProps = ViewProps & { className?: string };

export function Card({ children }: CardSlotProps) {
  return (
    <YStack
      backgroundColor="$background"
      borderRadius="$lg"
      borderWidth={1}
      borderColor="$border"
      padding="$lg"
      gap="$md"
    >
      {children}
    </YStack>
  );
}

export function CardHeader({ children }: CardSlotProps) {
  return (
    <XStack justifyContent="space-between" alignItems="center">
      {children}
    </XStack>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <Text fontSize="$xl" fontWeight="700" color="$foreground">
      {children}
    </Text>
  );
}

export function CardAction({ children }: CardSlotProps) {
  return (
    <XStack alignItems="center" gap="$xs">
      {children}
    </XStack>
  );
}

export function CardContent({ children }: CardSlotProps) {
  return <YStack gap="$md">{children}</YStack>;
}

export function CardFooter({ children }: CardSlotProps) {
  return (
    <XStack justifyContent="flex-end" gap="$md">
      {children}
    </XStack>
  );
}
