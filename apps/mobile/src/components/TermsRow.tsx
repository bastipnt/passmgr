import { Check } from "@tamagui/lucide-icons-2";
import { Text, View, XStack } from "tamagui";

export type TermsRowProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
};

/** Checkbox + agreement copy; the "Terms" word is a presentational link for now. */
export function TermsRow({ checked, onChange }: TermsRowProps) {
  return (
    <XStack items="center" gap="$sm" mt="$sm">
      <View
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="Agree to terms"
        width={22}
        height={22}
        rounded={6}
        borderWidth={1.5}
        items="center"
        justify="center"
        borderColor={checked ? "$primary" : "$borderColor"}
        bg={checked ? "$primary" : "transparent"}
        hitSlop={8}
        onPress={() => onChange(!checked)}
        pressStyle={{ opacity: 0.7 }}
      >
        {checked && <Check size={15} color="$primaryForeground" />}
      </View>

      <Text fontSize={13.5} color="$mutedForeground" flex={1}>
        I agree to the {/* TODO: link to a real Terms & Privacy page */}
        <Text fontSize={13.5} fontWeight="700" color="$primary">
          Terms
        </Text>{" "}
        and Privacy Policy.
      </Text>
    </XStack>
  );
}
