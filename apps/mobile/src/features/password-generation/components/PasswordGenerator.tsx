import { useGeneratorDefaults } from "@repo/client";
import {
  EFF_WORDLIST_SIZE,
  estimateEntropy,
  estimatePassphraseEntropy,
  type GeneratorMode,
  generatePassphrase,
  generatePassword,
  getCharsetSize,
  getStrength,
  type PassphraseOptions,
  PasswordGeneratorError,
  type PasswordOptions,
} from "@repo/crypto";
import { Button, StrengthMeter } from "@repo/ui-native";
import * as Clipboard from "expo-clipboard";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import GeneratorModeSwitch from "@/features/password-generation/components/GeneratorModeSwitch";
import PassphraseOptionsForm from "@/features/password-generation/components/PassphraseOptions";
import PasswordOptionsForm from "@/features/password-generation/components/PasswordOptionsForm";
import { usePasswordGenerator } from "@/features/password-generation/PasswordGeneratorContext";

export default function PasswordGenerator() {
  const router = useRouter();
  const { applyGenerated } = usePasswordGenerator();
  const defaults = useGeneratorDefaults();
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const foregroundColor = useCSSVariable("--color-foreground") as string;
  const primaryColor = useCSSVariable("--color-primary") as string;

  // Seeded from the saved defaults; edits here are for this password only. The
  // generator is a route, so it remounts on every open and re-reads them.
  const [mode, setMode] = useState<GeneratorMode>(defaults.mode);
  const [pwOpts, setPwOpts] = useState<PasswordOptions>(defaults.pwOpts);
  const [phOpts, setPhOpts] = useState<PassphraseOptions>(defaults.phOpts);
  const [generated, setGenerated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const noCharset = !pwOpts.uppercase && !pwOpts.lowercase && !pwOpts.digits && !pwOpts.symbols;

  const regenerate = useCallback(async () => {
    setError(null);
    setCopied(false);
    try {
      if (mode === "password") {
        setGenerated(generatePassword(pwOpts));
      } else {
        setGenerated(await generatePassphrase(phOpts));
      }
    } catch (e) {
      if (e instanceof PasswordGeneratorError) {
        setGenerated("");
        setError(e.message);
      } else {
        throw e;
      }
    }
  }, [mode, pwOpts, phOpts]);

  useEffect(() => {
    void regenerate();
  }, [regenerate]);

  const entropy = useMemo(() => {
    if (mode === "password") {
      return estimateEntropy(pwOpts.length, getCharsetSize(pwOpts));
    }
    return estimatePassphraseEntropy(phOpts.wordCount, EFF_WORDLIST_SIZE);
  }, [mode, pwOpts, phOpts]);

  const strength = getStrength(entropy);

  const onCopy = async () => {
    if (!generated) return;
    await Clipboard.setStringAsync(generated);
    setCopied(true);
  };

  const onUse = () => {
    if (!generated || noCharset) return;
    applyGenerated(generated);
    router.back();
  };

  return (
    <View className="flex-1">
      {/* Native bar items rather than views floating over the sheet — only real
          `UIBarButtonItem`s get UIKit's glass instead of sitting on top of it. */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle,
          title: "Generate password",
          unstable_headerLeftItems: () => [
            {
              type: "button",
              label: "Close",
              accessibilityLabel: "Close",
              icon: { type: "sfSymbol", name: "xmark" },
              tintColor: foregroundColor,
              onPress: () => router.back(),
            },
          ],
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: "Use",
              variant: "prominent",
              tintColor: primaryColor,
              disabled: !generated || noCharset,
              onPress: onUse,
            },
          ],
        }}
      />

      <KeyboardAwareScrollView mode="layout" contentContainerClassName="grow gap-lg p-md">
        <GeneratorModeSwitch mode={mode} setMode={setMode} />

        <View className="gap-sm">
          <View className="justify-center rounded-lg border border-border bg-muted/50 p-md">
            {error ? (
              <Text className="text-destructive text-md">{error}</Text>
            ) : (
              <Text
                selectable
                className="text-foreground text-md"
                style={{ fontFamily: "Courier" }}
              >
                {generated}
              </Text>
            )}
          </View>

          <StrengthMeter
            level={strength.level}
            label={`${strength.label} · ${Math.round(strength.bits)} bits`}
          />

          <View className="flex-row gap-sm">
            <Button
              className="flex-1"
              variant="outline"
              onPress={() => void onCopy()}
              disabled={!generated}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button className="flex-1" variant="outline" onPress={() => void regenerate()}>
              Regenerate
            </Button>
          </View>
        </View>

        {mode === "password" ? (
          <PasswordOptionsForm pwOpts={pwOpts} setPwOpts={setPwOpts} />
        ) : (
          <PassphraseOptionsForm phOpts={phOpts} setPhOpts={setPhOpts} />
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
