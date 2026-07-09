import { YStack, View, Text } from "tamagui";
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
    <YStack flex={1} items="center" justify="center" bg="#4B36D6">
      <SplashGradient />

      {/* floating decor */}
      <View
        position="absolute"
        t={120}
        l={-40}
        width={150}
        height={150}
        rounded={44}
        borderWidth={2}
        borderColor="rgba(255,255,255,0.18)"
        rotate="18deg"
      />
      <View
        position="absolute"
        b={150}
        r={-50}
        width={190}
        height={190}
        rounded={56}
        borderWidth={2}
        borderColor="rgba(255,255,255,0.14)"
        rotate="-12deg"
      />
      <View
        position="absolute"
        t={250}
        r={40}
        width={14}
        height={14}
        rounded={5}
        bg="rgba(255,255,255,0.5)"
      />
      <View
        position="absolute"
        b={280}
        l={44}
        width={10}
        height={10}
        rounded={4}
        bg="rgba(255,255,255,0.4)"
      />

      {/* logo + wordmark */}
      <YStack items="center" gap={26}>
        <BlurView
          intensity={18}
          tint="light"
          width={118}
          height={118}
          rounded={30}
          overflow="hidden"
          items="center"
          justify="center"
          borderWidth={1.5}
          borderColor="rgba(255,255,255,0.35)"
          bg="rgba(255,255,255,0.14)"
          shadowColor="rgba(40,30,120,0.4)"
          shadowOffset={{ width: 0, height: 18 }}
          shadowRadius={30}
          shadowOpacity={1}
        >
          <BrandMark size={70} color="$background" />
        </BlurView>
        <Wordmark size={40} color="$background" dot="$mutedForeground" />
      </YStack>

      {/* footer */}
      <YStack position="absolute" b={insets.bottom + 64} items="center" gap={14}>
        <Text
          fontFamily="$body"
          fontSize={14}
          fontWeight="600"
          color="rgba(255,255,255,0.78)"
          letterSpacing={0.3}
        >
          End-to-end encrypted
        </Text>
        <SpinnerRing size={26} />
      </YStack>
    </YStack>
  );
}
