import { type PassphraseOptions, SEPARATORS } from "@repo/crypto";
import { cn, OptionToggle, Slider } from "@repo/ui-native";
import { Pressable, Text, View } from "react-native";

type PassphraseOptionsFormProps = {
  phOpts: PassphraseOptions;
  setPhOpts: (cb: (o: PassphraseOptions) => PassphraseOptions) => void;
};

export default function PassphraseOptionsForm({ phOpts, setPhOpts }: PassphraseOptionsFormProps) {
  return (
    <View className="gap-md">
      <View className="gap-sm">
        <View className="flex-row items-center justify-between">
          <Text className="text-foreground text-md">Words</Text>
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

      <View className="gap-sm">
        <Text className="text-foreground text-md">Separator</Text>
        <View className="flex-row gap-xs rounded-lg border border-border bg-card p-xs">
          {SEPARATORS.map(({ label, value }) => {
            const selected = phOpts.separator === value;

            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Separator ${label}`}
                onPress={() => setPhOpts((o) => ({ ...o, separator: value }))}
                className={cn(
                  "h-[36px] flex-1 items-center justify-center rounded-md",
                  selected && "bg-primary",
                )}
                style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
              >
                <Text
                  className={cn(
                    "font-semibold text-sm",
                    selected ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
