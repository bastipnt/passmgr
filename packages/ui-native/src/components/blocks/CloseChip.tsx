import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { Pressable } from "react-native";
import { useCSSVariable } from "uniwind";

/** Round chip in a sheet header that dismisses the sheet. */
export function CloseChip() {
  const router = useRouter();
  const iconColor = useCSSVariable("--color-foreground") as string;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={8}
      className="h-[32px] w-[32px] items-center justify-center rounded-full bg-muted"
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
      onPress={() => router.back()}
    >
      <X size={18} color={iconColor} />
    </Pressable>
  );
}
