import { useEffect } from "react";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { AnimatedView } from "../AnimatedView";

export type SpinnerRingProps = {
  size?: number;
};

/** Continuously rotating ring: faint border with a solid top edge. */
export function SpinnerRing({ size = 26 }: SpinnerRingProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <AnimatedView
      className="border-[2.5px] border-border border-t-background"
      style={[{ width: size, height: size, borderRadius: size / 2 }, animatedStyle]}
    />
  );
}
