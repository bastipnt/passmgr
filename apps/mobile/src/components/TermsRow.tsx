import { Pressable, View, Text } from "react-native";
import { Check } from "lucide-react-native";
import { useCSSVariable } from "uniwind";
import { cn } from "@repo/ui-native";

export type TermsRowProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
};

/** Checkbox + agreement copy; the "Terms" word is a presentational link for now. */
export function TermsRow({ checked, onChange }: TermsRowProps) {
  const checkColor = useCSSVariable("--color-primary-foreground") as string;

  return (
    <View className="mt-sm flex-row items-center gap-sm">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="Agree to terms"
        hitSlop={8}
        className={cn(
          "h-[22px] w-[22px] items-center justify-center rounded-[6px] border-[1.5px]",
          checked ? "border-primary bg-primary" : "border-border bg-transparent",
        )}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
        onPress={() => onChange(!checked)}
      >
        {checked && <Check size={15} color={checkColor} />}
      </Pressable>

      <Text className="flex-1 text-muted-foreground" style={{ fontSize: 13.5 }}>
        I agree to the{" "}
        <Text className="font-bold text-primary" style={{ fontSize: 13.5 }}>
          Terms
        </Text>{" "}
        and Privacy Policy.
      </Text>
    </View>
  );
}
