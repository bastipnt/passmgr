import { type ViewProps } from "react-native";
import { YStack } from "tamagui";

export function FieldGroup({ children }: ViewProps & { className?: string }) {
  return <YStack gap="$4">{children}</YStack>;
}
