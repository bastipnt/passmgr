import { ReactNode } from "react";
import { View } from "react-native";
import { ScrollFade } from "./ScrollFade";

type SheetActionsProps = {
  children: ReactNode;
};

function SheetActions({ children }: SheetActionsProps) {
  return (
    <>
      <ScrollFade edge="top" height={80} />
      {/* Floats over the scroll view; `box-none` keeps the gap between the
        buttons scrollable. */}
      <View
        pointerEvents="box-none"
        className="absolute top-4 right-0 left-0 flex-row justify-between px-4"
      >
        {children}
      </View>
    </>
  );
}

export { SheetActions };
