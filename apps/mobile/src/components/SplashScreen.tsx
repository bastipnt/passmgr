import { BrandGlyph, SpinnerRing } from "@repo/ui-native";
import { BRAND_COLOR } from "@repo/ui-shared";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Branded splash shown while the persisted session is being restored, and as the
 * JS hand-off from the native boot splash (same solid violet, see app.json).
 */
export function SplashScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: BRAND_COLOR }}>
      <View className="items-center gap-5">
        <BrandGlyph size={88} />
        <Text className="font-display-bold text-[40px] text-white tracking-[-0.8px]">passmgr</Text>
      </View>

      <View className="absolute items-center gap-3.5" style={{ bottom: insets.bottom + 64 }}>
        <Text className="font-semibold text-sm text-white/80 tracking-[0.3px]">
          End-to-end encrypted
        </Text>
        <SpinnerRing size={26} />
      </View>
    </View>
  );
}
