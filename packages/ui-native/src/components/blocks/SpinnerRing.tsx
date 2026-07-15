import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useCSSVariable } from "uniwind";

export type SpinnerRingProps = {
  size?: number;
};

/** Continuously rotating ring: faint border with a solid top edge. */
export function SpinnerRing({ size = 26 }: SpinnerRingProps) {
  const rotation = useSharedValue(0);
  // Resolve token colors to concrete strings — className on an Animated.View
  // isn't intercepted by Uniwind, so we drive border colors via style instead.
  const [borderColor, topColor] = useCSSVariable([
    "--color-border",
    "--color-background",
  ]) as string[];

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
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2.5,
          borderColor,
          borderTopColor: topColor,
        },
        animatedStyle,
      ]}
    />
  );
}
