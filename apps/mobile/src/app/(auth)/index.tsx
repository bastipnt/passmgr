import {
  AppIcon,
  BiometricGlyph,
  Blobs,
  type BottomSheetRef,
  Button,
  Wordmark,
} from "@repo/ui-native";
import { useRef } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { SignInSheet } from "@/features/auth/components/SignInSheet";
import { SignUpSheet } from "@/features/auth/components/SignUpSheet";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const foreground = useCSSVariable("--color-foreground") as string;
  const signInRef = useRef<BottomSheetRef>(null);
  const signUpRef = useRef<BottomSheetRef>(null);

  return (
    <View className="flex-1 bg-background">
      <Blobs tone="light" />

      <View
        className="flex-1 px-lg"
        style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
      >
        {/* brand lockup */}
        <View className="mt-[8px] items-center gap-[16px]">
          <AppIcon size={74} />
          <Wordmark size={26} colorClassName="text-foreground" dotClassName="text-primary" />
        </View>

        {/* welcome */}
        <View className="mt-[40px] items-center gap-[10px]">
          <Text
            className="font-bold text-foreground"
            style={{ fontSize: 30, lineHeight: 36, letterSpacing: -0.6 }}
          >
            Welcome back
          </Text>
          <Text
            className="text-center text-muted-foreground"
            style={{ fontSize: 15.5, lineHeight: 23 }}
          >
            Your passwords, synced and{"\n"}protected on every device.
          </Text>
        </View>

        {/* prominent Face ID */}
        <View className="flex-1 items-center justify-center gap-[16px]">
          <View
            className="h-[96px] w-[96px] items-center justify-center rounded-full bg-white"
            style={{
              shadowColor: "rgba(79,70,229,0.5)",
              shadowOffset: { width: 0, height: 14 },
              shadowRadius: 30,
              shadowOpacity: 1,
            }}
          >
            <BiometricGlyph size={42} color={foreground} />
          </View>
          {/* TODO: wire biometric unlock (LocalAuthentication + session restore) */}
          <Text className="font-bold text-primary" style={{ fontSize: 15 }}>
            Unlock with Face ID
          </Text>
        </View>

        {/* actions */}
        <View className="gap-[12px]">
          <Button
            size="lg"
            textClassName="font-bold"
            onPress={() => signInRef.current?.triggerShowHide(true)}
          >
            Sign in
          </Button>
          <Button
            variant="ghost"
            size="lg"
            textClassName="text-primary font-bold"
            onPress={() => signUpRef.current?.triggerShowHide(true)}
          >
            Create account
          </Button>
        </View>
      </View>

      <SignInSheet ref={signInRef} />
      <SignUpSheet
        ref={signUpRef}
        onSwitchToSignIn={() => signInRef.current?.triggerShowHide(true)}
      />
    </View>
  );
}
