import { useEffect } from "react";
import type { DimensionValue, ViewStyle } from "react-native";
import { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { AnimatedView } from "./AnimatedView";

export type SkeletonProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = "100%", height = 16, borderRadius = 6, style }: SkeletonProps) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <AnimatedView
      className="bg-muted"
      style={[{ width, height, borderRadius }, animatedStyle, style]}
    />
  );
}
