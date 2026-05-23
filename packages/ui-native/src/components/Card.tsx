import { ReactNode } from "react";
import { Card as CardPrimitive, CardProps, Text, XStack, YStack } from "tamagui";

type CardSlotProps = CardProps & { className?: string };

export function Card({ children }: CardSlotProps) {
  return (
    <CardPrimitive borderWidth={1} borderColor="$borderColor" padding="$1" gap="$1">
      {children}
    </CardPrimitive>
  );
}

export function CardHeader({ children }: CardSlotProps) {
  return (
    <CardPrimitive.Header>
      <XStack content="space-between" items="center" gap="$4">
        {children}
      </XStack>
    </CardPrimitive.Header>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <Text fontSize="$xl" fontWeight="700" flex={1}>
      {children}
    </Text>
  );
}

export function CardAction({ children }: CardSlotProps) {
  return (
    <XStack items="center" gap="$4">
      {children}
    </XStack>
  );
}

export function CardContent({ children }: CardSlotProps) {
  return (
    <YStack gap="$4" p="$4">
      {children}
    </YStack>
  );
}

export function CardFooter({ children }: CardSlotProps) {
  return (
    <CardPrimitive.Footer>
      <XStack flex={1} justify="flex-end" gap="$4" p="$4">
        {children}
      </XStack>
    </CardPrimitive.Footer>
  );
}
