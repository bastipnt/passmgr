import type { ReactNode } from "react";
import { Text, View } from "react-native";

type RecordGroupLabelProps = {
  text: string;
  /** Trailing node on the label row, e.g. a "Clear" link. */
  action?: ReactNode;
};

/** Uppercase group heading above a run of full-bleed rows (web phone list). */
export function RecordGroupLabel({ text, action }: RecordGroupLabelProps) {
  return (
    <View className="flex-row items-end justify-between px-5 pt-5 pb-1.5">
      <Text className="font-semibold text-muted-foreground text-xs uppercase tracking-[1px]">
        {text}
      </Text>
      {action}
    </View>
  );
}
