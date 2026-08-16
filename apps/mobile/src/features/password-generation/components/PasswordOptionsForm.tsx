import type { PasswordOptions } from "@repo/crypto";
import { Input, OptionToggle, Slider } from "@repo/ui-native";
import { clampInt } from "@repo/util";
import { Text, View } from "react-native";

type PasswordOptionsFormProps = {
  pwOpts: PasswordOptions;
  setPwOpts: (cb: (o: PasswordOptions) => PasswordOptions) => void;
};

export default function PasswordOptionsForm({ pwOpts, setPwOpts }: PasswordOptionsFormProps) {
  return (
    <View className="gap-md">
      <View className="gap-sm">
        <View className="flex-row items-center justify-between">
          <Text className="text-foreground text-md">Length</Text>
          <Text className="text-muted-foreground text-sm">{pwOpts.length}</Text>
        </View>
        <Slider
          accessibilityLabel="Password length"
          min={8}
          max={128}
          step={1}
          value={pwOpts.length}
          onValueChange={(v) => setPwOpts((o) => ({ ...o, length: v }))}
        />
      </View>

      <OptionToggle
        label="A–Z (uppercase)"
        checked={pwOpts.uppercase}
        onChange={(v) => setPwOpts((o) => ({ ...o, uppercase: v }))}
      />
      <OptionToggle
        label="a–z (lowercase)"
        checked={pwOpts.lowercase}
        onChange={(v) => setPwOpts((o) => ({ ...o, lowercase: v }))}
      />
      <OptionToggle
        label="0–9 (digits)"
        checked={pwOpts.digits}
        onChange={(v) => setPwOpts((o) => ({ ...o, digits: v }))}
      />
      <OptionToggle
        label="!@#$ (symbols)"
        checked={pwOpts.symbols}
        onChange={(v) => setPwOpts((o) => ({ ...o, symbols: v }))}
      />
      <OptionToggle
        label="Avoid ambiguous (O, 0, I, l, 1)"
        checked={pwOpts.avoidAmbiguous}
        onChange={(v) => setPwOpts((o) => ({ ...o, avoidAmbiguous: v }))}
      />

      {(pwOpts.digits || pwOpts.symbols) && (
        <View className="flex-row gap-md">
          {pwOpts.digits && (
            <Input
              label="Min digits"
              keyboardType="number-pad"
              value={String(pwOpts.minDigits)}
              onChangeText={(text) =>
                setPwOpts((o) => ({ ...o, minDigits: clampInt(text, 0, o.length) }))
              }
            />
          )}
          {pwOpts.symbols && (
            <Input
              label="Min symbols"
              keyboardType="number-pad"
              value={String(pwOpts.minSymbols)}
              onChangeText={(text) =>
                setPwOpts((o) => ({ ...o, minSymbols: clampInt(text, 0, o.length) }))
              }
            />
          )}
        </View>
      )}
    </View>
  );
}
