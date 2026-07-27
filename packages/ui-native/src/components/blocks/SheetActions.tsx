import { StyleSheet, View } from "react-native";
import { BlurView } from "../BlurView";
import { CloseChip } from "./CloseChip";
import { ReactNode } from "react";

type SheetActionsProps = {
  children: ReactNode;
};

function SheetActions({ children }: SheetActionsProps) {
  return (
    <BlurView
      intensity={50}
      tint="default"
      style={[StyleSheet.absoluteFill, { bottom: undefined, height: "auto" }]}
    >
      <View className="flex-row p-lg pb-md w-full justify-between gap-4">
        <CloseChip />
        <View className="flex-row gap-2">{children}</View>
      </View>
    </BlurView>
  );
}

export { SheetActions };
