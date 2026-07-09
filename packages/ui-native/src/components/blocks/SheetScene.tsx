import { type ReactNode } from "react";
import { Platform } from "react-native";
import { Button, Text, XStack, YStack } from "tamagui";
import { KeyboardAvoidingView } from "../KeyboardAvoidingView";
import { Spinner } from "../Spinner";
import { CloseChip } from "./CloseChip";

export type SheetSceneProps = {
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  loading?: boolean;
  children: ReactNode;
};

/**
 * Shared layout for the sign-in / sign-up form-sheets: header (title + subtitle +
 * close chip), the form content, a flex spacer, and a bottom-pinned primary action.
 */
export function SheetScene({
  title,
  subtitle,
  actionLabel,
  onAction,
  actionDisabled,
  loading,
  children,
}: SheetSceneProps) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} flex={1}>
      <YStack flex={1} bg="$background" p={24}>
        <XStack items="flex-start" justify="space-between" mb={22}>
          <YStack gap={6}>
            <Text
              fontFamily="$heading"
              fontSize={26}
              fontWeight="700"
              letterSpacing={-0.5}
              color="$foreground"
            >
              {title}
            </Text>
            <Text fontFamily="$body" fontSize={14} color="$mutedForeground">
              {subtitle}
            </Text>
          </YStack>
          <CloseChip />
        </XStack>

        <YStack flex={1} justify="center" gap="$lg" mb="$lg">
          {children}
        </YStack>

        <Button
          height={52}
          rounded="$lg"
          bg="$primary"
          color="$primaryForeground"
          fontWeight="700"
          disabled={actionDisabled || loading}
          opacity={actionDisabled ? 0.5 : 1}
          pressStyle={{ bg: "$primaryPressed", borderColor: "$primaryPressed" }}
          onPress={onAction}
        >
          {actionLabel}
          {loading && <Spinner />}
        </Button>
      </YStack>
    </KeyboardAvoidingView>
  );
}
