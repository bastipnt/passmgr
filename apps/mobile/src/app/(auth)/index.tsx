import { type BottomSheetRef, BrandLockup, Button, Screen, SpectrumText } from "@repo/ui-native";
import { FIELD_COLORS } from "@repo/ui-shared";
import { ShieldCheck } from "lucide-react-native";
import { useRef } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { RecoverSheet } from "@/features/auth/components/RecoverSheet";
import { SignInSheet } from "@/features/auth/components/SignInSheet";
import { SignUpSheet } from "@/features/auth/components/SignUpSheet";

const HERO_SIZE = 40;
const HERO_LEADING = 38;
const HERO_TRACKING = -1.4;

const CHIPS = ["Zero-knowledge", "OPAQUE login", "End-to-end encrypted"];
const CHIP_DOTS = [FIELD_COLORS.pink, FIELD_COLORS.amber, FIELD_COLORS.cyan];

function HeroLine({ children }: { children: string }) {
  return (
    <Text
      className="font-display text-foreground"
      style={{ fontSize: HERO_SIZE, lineHeight: HERO_LEADING, letterSpacing: HERO_TRACKING }}
    >
      {children}
    </Text>
  );
}

/** Web's auth screen at phone width: vivid light field, display hero, chips. */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const muted = useCSSVariable("--color-muted-foreground") as string;
  const signInRef = useRef<BottomSheetRef>(null);
  const signUpRef = useRef<BottomSheetRef>(null);
  const recoverRef = useRef<BottomSheetRef>(null);

  return (
    <Screen field="vivid">
      <View
        className="flex-1 px-5"
        style={{ paddingTop: Math.max(insets.top, 24), paddingBottom: insets.bottom + 16 }}
      >
        <BrandLockup />

        <View className="flex-1 justify-center gap-5">
          <View accessibilityRole="header">
            <HeroLine>Your secrets,</HeroLine>
            <SpectrumText
              fontSize={HERO_SIZE}
              lineHeight={HERO_LEADING}
              letterSpacing={HERO_TRACKING}
            >
              seen by no one
            </SpectrumText>
            <HeroLine>but you.</HeroLine>
          </View>
          <Text className="text-[16px] text-muted-foreground leading-6">
            passmgr encrypts your vault on this device before anything leaves it. The server never
            learns your password — not even once.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {CHIPS.map((chip, i) => (
              <View
                key={chip}
                className="flex-row items-center gap-2 rounded-full border border-foreground/12 bg-white/50 px-3.5 py-1.5 dark:border-white/12 dark:bg-white/5"
              >
                <View
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: CHIP_DOTS[i] }}
                />
                <Text className="text-foreground text-sm">{chip}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="gap-3">
          <Button size="lg" onPress={() => signInRef.current?.triggerShowHide(true)}>
            Sign in
          </Button>
          <Button
            variant="glass"
            size="lg"
            onPress={() => signUpRef.current?.triggerShowHide(true)}
          >
            Create account
          </Button>
          <View className="flex-row items-center justify-center gap-1.5 pt-2">
            <ShieldCheck size={14} color={muted} />
            <Text className="text-muted-foreground text-xs">
              Your password never leaves this device
            </Text>
          </View>
        </View>
      </View>

      <SignInSheet
        ref={signInRef}
        onForgotPassword={() => recoverRef.current?.triggerShowHide(true)}
      />
      <RecoverSheet
        ref={recoverRef}
        onSwitchToSignIn={() => signInRef.current?.triggerShowHide(true)}
      />
      <SignUpSheet
        ref={signUpRef}
        onSwitchToSignIn={() => signInRef.current?.triggerShowHide(true)}
      />
    </Screen>
  );
}
