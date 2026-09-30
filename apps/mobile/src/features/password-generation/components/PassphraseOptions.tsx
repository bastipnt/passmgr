import { type PassphraseOptions, SEPARATORS } from "@repo/crypto";
import { OptionToggle, SegmentedControl, Slider } from "@repo/ui-native";
import { Text, View } from "react-native";

type PassphraseOptionsFormProps = {
  phOpts: PassphraseOptions;
  setPhOpts: (cb: (o: PassphraseOptions) => PassphraseOptions) => void;
};

export default function PassphraseOptionsForm({ phOpts, setPhOpts }: PassphraseOptionsFormProps) {
  return (
    <View className="gap-5">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-[16px] text-foreground">Words</Text>
          <Text className="text-muted-foreground text-sm">{phOpts.wordCount}</Text>
        </View>
        <Slider
          accessibilityLabel="Word count"
          min={3}
          max={10}
          step={1}
          value={phOpts.wordCount}
          onValueChange={(v) => setPhOpts((o) => ({ ...o, wordCount: v }))}
        />
      </View>

      <View className="gap-2">
        <Text className="text-[16px] text-foreground">Separator</Text>
        <SegmentedControl
          value={phOpts.separator}
          options={SEPARATORS.map(({ label, value }) => ({
            value,
            label,
            accessibilityLabel: `Separator ${label}`,
          }))}
          onChange={(value) => setPhOpts((o) => ({ ...o, separator: value }))}
        />
      </View>

      <OptionToggle
        label="Capitalize words"
        checked={phOpts.capitalize}
        onChange={(v) => setPhOpts((o) => ({ ...o, capitalize: v }))}
      />
      <OptionToggle
        label="Include a number"
        checked={phOpts.includeNumber}
        onChange={(v) => setPhOpts((o) => ({ ...o, includeNumber: v }))}
      />
    </View>
  );
}
