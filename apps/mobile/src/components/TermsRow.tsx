import { cn } from "@repo/ui-native";
import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";

export type TermsRowProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
};

/** Checkbox + agreement copy; the "Terms" word is a presentational link for now. */
export function TermsRow({ checked, onChange }: TermsRowProps) {
  const checkColor = useCSSVariable("--color-primary-foreground") as string;

  return (
    <View className="mt-2 flex-row items-center gap-2.5">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="Agree to terms"
        hitSlop={8}
        className={cn(
          "h-[22px] w-[22px] items-center justify-center rounded-[6px] border",
          checked ? "border-primary bg-primary" : "border-foreground/20 bg-field",
        )}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
        onPress={() => onChange(!checked)}
      >
        {checked && <Check size={15} color={checkColor} />}
      </Pressable>

      <Text className="flex-1 text-[13px] text-muted-foreground">
        I agree to the <Text className="font-semibold text-foreground underline">Terms</Text> and
        Privacy Policy.
      </Text>
    </View>
  );
}
