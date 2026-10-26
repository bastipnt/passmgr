import { BrandGlyph, SpinnerRing } from "@repo/ui-native";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";

/** Branded splash in the accent, shown while the persisted session is being restored. */
export function SplashScreen() {
  const insets = useSafeAreaInsets();
  const onPrimary = useCSSVariable("--color-primary-foreground") as string;

  return (
    <View className="flex-1 items-center justify-center bg-primary">
      <View className="items-center gap-5">
        <BrandGlyph size={88} color={onPrimary} />
        <Text className="font-display-bold text-[40px] text-primary-foreground tracking-[-0.8px]">
          passmgr
        </Text>
      </View>

      <View className="absolute items-center gap-3.5" style={{ bottom: insets.bottom + 64 }}>
        <Text className="font-semibold text-primary-foreground/80 text-sm tracking-[0.3px]">
          End-to-end encrypted
        </Text>
        <SpinnerRing size={26} />
      </View>
    </View>
  );
}
