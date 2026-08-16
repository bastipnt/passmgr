import {
  BottomSheet as BottomSheetPrimitive,
  type BottomSheetProps as BottomSheetPrimitiveProps,
  RNHostView,
} from "@expo/ui";
import { ReactNode, Ref, useImperativeHandle, useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cn } from "../lib/utils";
import { Button } from "./Button";

type BottomSheetRef = {
  triggerShowHide: (show: boolean) => void;
};

type BottomSheetProps = Omit<BottomSheetPrimitiveProps, "isPresented" | "onDismiss"> & {
  children: ReactNode;
  className?: string;
  /**
   * Pinned below the scrollable content. Defaults to a "Close" button; pass a
   * custom node (e.g. a submit button) to replace it.
   */
  footer?: ReactNode;
  ref: Ref<BottomSheetRef>;
};

function BottomSheet({
  children,
  className,
  footer,
  ref,
  snapPoints = ["half"],
  ...props
}: BottomSheetProps) {
  const [isPresented, setIsPresented] = useState(false);

  useImperativeHandle(ref, () => ({
    triggerShowHide: (show: boolean) => setIsPresented(show),
  }));

  return (
    <BottomSheetPrimitive
      {...props}
      isPresented={isPresented}
      onDismiss={() => setIsPresented(false)}
      snapPoints={snapPoints}
    >
      <RNHostView>
        <View className="flex-1 gap-2">
          {/* `flex-1` on the scroll view (not the content container) keeps the
              footer inside the host's hit-testable frame. */}
          <KeyboardAwareScrollView
            className="flex-1"
            contentContainerClassName={cn("grow", className)}
          >
            {children}
          </KeyboardAwareScrollView>

          {footer ?? <Button onPress={() => setIsPresented(false)}>Close</Button>}
        </View>
      </RNHostView>
    </BottomSheetPrimitive>
  );
}

export { BottomSheet, type BottomSheetRef };
