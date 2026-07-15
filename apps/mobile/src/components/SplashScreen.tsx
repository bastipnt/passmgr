import { View, Text } from "react-native";
import { BlurView, BrandMark, SpinnerRing, SplashGradient, Wordmark } from "@repo/ui-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Branded splash shown while the persisted session is being restored, and as the
 * JS hand-off from the native boot splash. Purple brand gradient with floating
 * decor, a frosted-glass logo tile, the Passmgr wordmark, and a footer.
 */
export function SplashScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 items-center justify-center bg-[#4B36D6]">
      <SplashGradient />

      {/* floating decor */}
      <View
        className="absolute left-[-40px] top-[120px] h-[150px] w-[150px] rounded-[44px] border-2 border-[rgba(255,255,255,0.18)]"
        style={{ transform: [{ rotate: "18deg" }] }}
      />
      <View
        className="absolute bottom-[150px] right-[-50px] h-[190px] w-[190px] rounded-[56px] border-2 border-[rgba(255,255,255,0.14)]"
        style={{ transform: [{ rotate: "-12deg" }] }}
      />
      <View className="absolute right-[40px] top-[250px] h-[14px] w-[14px] rounded-[5px] bg-[rgba(255,255,255,0.5)]" />
      <View className="absolute bottom-[280px] left-[44px] h-[10px] w-[10px] rounded-[4px] bg-[rgba(255,255,255,0.4)]" />

      {/* logo + wordmark */}
      <View className="items-center gap-[26px]">
        <BlurView
          intensity={18}
          tint="light"
          className="h-[118px] w-[118px] items-center justify-center overflow-hidden rounded-[30px] border-[1.5px] border-[rgba(255,255,255,0.35)] bg-[rgba(255,255,255,0.14)]"
          style={{
            shadowColor: "rgba(40,30,120,0.4)",
            shadowOffset: { width: 0, height: 18 },
            shadowRadius: 30,
            shadowOpacity: 1,
          }}
        >
          <BrandMark size={70} />
        </BlurView>
        <Wordmark size={40} />
      </View>

      {/* footer */}
      <View className="absolute items-center gap-[14px]" style={{ bottom: insets.bottom + 64 }}>
        <Text
          className="text-[rgba(255,255,255,0.78)]"
          style={{ fontSize: 14, fontWeight: "600", letterSpacing: 0.3 }}
        >
          End-to-end encrypted
        </Text>
        <SpinnerRing size={26} />
      </View>
    </View>
  );
}
