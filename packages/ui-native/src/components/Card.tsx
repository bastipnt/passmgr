import { ReactNode } from "react";
import { Card as CardPrimitive, CardProps, Text, XStack, YStack } from "tamagui";

type CardSlotProps = CardProps & { className?: string };

export function Card({ children }: CardSlotProps) {
  return (
    <CardPrimitive borderWidth={1} borderColor="$borderColor" padding="$sm" gap="$sm">
      {children}
    </CardPrimitive>
  );
}

export function CardHeader({ children }: CardSlotProps) {
  return (
    <CardPrimitive.Header>
      <XStack content="space-between" items="center" gap="$lg">
        {children}
      </XStack>
    </CardPrimitive.Header>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <Text fontSize="$lg" fontWeight="700" flex={1}>
      {children}
    </Text>
  );
}

export function CardAction({ children }: CardSlotProps) {
  return (
    <XStack items="center" gap="$lg">
      {children}
    </XStack>
  );
}

export function CardContent({ children }: CardSlotProps) {
  return (
    <YStack gap="$lg" p="$lg">
      {children}
    </YStack>
  );
}

export function CardFooter({ children }: CardSlotProps) {
  return (
    <CardPrimitive.Footer>
      <XStack flex={1} justify="flex-end" gap="$lg" p="$lg">
        {children}
      </XStack>
    </CardPrimitive.Footer>
  );
}
