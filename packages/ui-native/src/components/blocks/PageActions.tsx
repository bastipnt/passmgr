import { View } from "react-native";
import { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollFade } from "./ScrollFade";

type PageActionsProps = {
  children: ReactNode;
};

function PageActions({ children }: PageActionsProps) {
  const insets = useSafeAreaInsets();

  return (
    <>
      <ScrollFade edge="top" height={80} />
      {/* Floats over the scroll view; `box-none` keeps the gap between the
        buttons scrollable. */}
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 flex-row justify-between px-4"
        style={{ top: insets.top + 8 }}
      >
        {children}
      </View>
    </>
  );
}

export { PageActions };
