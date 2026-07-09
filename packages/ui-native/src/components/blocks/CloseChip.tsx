import { useRouter } from "expo-router";
import { X } from "@tamagui/lucide-icons-2";
import { View } from "tamagui";

/** Round chip in a sheet header that dismisses the sheet. */
export function CloseChip() {
  const router = useRouter();

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel="Close"
      width={32}
      height={32}
      rounded={16}
      bg="$muted"
      items="center"
      justify="center"
      hitSlop={8}
      onPress={() => router.back()}
      pressStyle={{ opacity: 0.6 }}
    >
      <X size={18} color="$color" />
    </View>
  );
}
