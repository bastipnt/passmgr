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
import { Button, SheetActions, StrengthMeter } from "@repo/ui-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import GeneratorModeSwitch from "@/features/password-generation/components/GeneratorModeSwitch";
import PassphraseOptionsForm from "@/features/password-generation/components/PassphraseOptions";
import PasswordOptionsForm from "@/features/password-generation/components/PasswordOptionsForm";
import { usePasswordGenerator } from "@/features/password-generation/PasswordGeneratorContext";

export default function PasswordGenerator() {
  const router = useRouter();
  const { applyGenerated } = usePasswordGenerator();
  const defaults = useGeneratorDefaults();

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
      <KeyboardAwareScrollView
        mode="layout"
        contentContainerClassName="grow gap-lg p-md pt-[80px]"
        bottomOffset={24}
      >
        <GeneratorModeSwitch mode={mode} setMode={setMode} />

        <View className="gap-sm">
          <View className="min-h-[64px] justify-center rounded-lg border border-border bg-muted/50 p-md">
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

      <SheetActions>
        <Button
          hug
          variant="glass"
          size="icon-lg"
          systemImage="xmark"
          accessibilityLabel="Close"
          onPress={() => router.back()}
        />

        <Button
          hug
          variant="glass-primary"
          size="lg"
          disabled={!generated || noCharset}
          onPress={onUse}
        >
          Use
        </Button>
      </SheetActions>
    </View>
  );
}
