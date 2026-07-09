import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { styled } from "tamagui";

export type SpinnerRingProps = {
  size?: number;
};

const StyledAnimatedView = styled(Animated.View);

/** Continuously rotating ring: faint border with a solid white top edge. */
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
    <StyledAnimatedView
      width={size}
      height={size}
      // @ts-expect-error
      borderRadius={size / 2}
      borderWidth="$2.5"
      borderColor="$border"
      borderTopColor="$background"
      style={animatedStyle}
    />
  );
}
