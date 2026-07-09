import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, View, YStack } from "tamagui";
import { AppIcon, BiometricGlyph, Blobs, Wordmark } from "@repo/ui-native";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <YStack flex={1} bg="$background">
      <Blobs tone="light" />

      <YStack flex={1} px={24} pt={insets.top + 16} pb={insets.bottom + 24}>
        {/* brand lockup */}
        <YStack items="center" gap={16} mt={8}>
          <AppIcon size={74} />
          <Wordmark size={26} color="$foreground" dot="$primary" />
        </YStack>

        {/* welcome */}
        <YStack items="center" mt={40} gap={10}>
          <Text
            fontFamily="$heading"
            fontSize={30}
            lineHeight={36}
            fontWeight="700"
            letterSpacing={-0.6}
            color="$foreground"
          >
            Welcome back
          </Text>
          <Text
            fontFamily="$body"
            fontSize={15.5}
            lineHeight={23}
            text="center"
            color="$mutedForeground"
          >
            Your passwords, synced and{"\n"}protected on every device.
          </Text>
        </YStack>

        {/* prominent Face ID */}
        <YStack flex={1} items="center" justify="center" gap={16}>
          <View
            width={96}
            height={96}
            rounded={48}
            bg="#fff"
            items="center"
            justify="center"
            shadowColor="rgba(79,70,229,0.5)"
            shadowOffset={{ width: 0, height: 14 }}
            shadowRadius={30}
            shadowOpacity={1}
          >
            <BiometricGlyph size={42} color="$foreground" />
          </View>
          {/* TODO: wire biometric unlock (LocalAuthentication + session restore) */}
          <Text fontFamily="$body" fontSize={15} fontWeight="700" color="$primary">
            Unlock with Face ID
          </Text>
        </YStack>

        {/* actions */}
        <YStack gap={12}>
          <Button
            height={52}
            rounded="$lg"
            bg="$primary"
            color="$primaryForeground"
            fontWeight="700"
            pressStyle={{ bg: "$primaryPressed", borderColor: "$primaryPressed" }}
            onPress={() => router.push("/(auth)/sign-in")}
          >
            Sign in
          </Button>
          <Button
            chromeless
            height={52}
            rounded="$lg"
            color="$primary"
            fontWeight="700"
            onPress={() => router.push("/(auth)/sign-up")}
          >
            Create account
          </Button>
        </YStack>
      </YStack>
    </YStack>
  );
}
