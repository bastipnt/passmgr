import { cn } from "@repo/ui-native";
import { Text } from "react-native";

/** Web's `Fingerprint`: a public key's six groups of five digits, to compare out of band. */
export function Fingerprint({ value, className }: { value: string; className?: string }) {
  return (
    <Text
      selectable
      className={cn(
        "rounded-lg bg-foreground/5 px-3 py-2.5 text-center font-mono text-[15px] text-foreground tracking-wider",
        className,
      )}
    >
      {value}
    </Text>
  );
}
