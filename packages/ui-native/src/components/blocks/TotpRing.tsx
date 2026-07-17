import { useEffect } from "react";
import { AppState, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useCSSVariable } from "uniwind";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type TotpRingProps = {
  /** Current TOTP period index — the ring refills whenever it changes. */
  period: number;
  periodMs: number;
  /** Whole seconds left in the period, shown in the center. */
  seconds?: number;
  size?: number;
};

/**
 * Countdown ring for a TOTP period. Instead of stepping once per second, the
 * arc drains in a single linear reanimated timing spanning the remaining
 * period, restarted at each rollover — smooth on the UI thread, no JS ticks.
 */
export function TotpRing({ period, periodMs, seconds, size = 36 }: TotpRingProps) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(1);
  const [trackColor, ringColor, warnColor] = useCSSVariable([
    "--color-muted",
    "--color-primary",
    "--color-destructive",
  ]) as string[];

  useEffect(() => {
    const startDrain = () => {
      const remainingMs = periodMs - (Date.now() % periodMs);
      progress.value = remainingMs / periodMs;
      progress.value = withTiming(0, { duration: remainingMs, easing: Easing.linear });
    };

    startDrain();
    // The reanimated clock pauses while the app is backgrounded, so the drain
    // resumes offset from wall time — restart it when the app becomes active.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") startDrain();
    });
    return () => subscription.remove();
  }, [period, periodMs, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const low = seconds !== undefined && seconds <= 5;

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={low ? warnColor : ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          fill="none"
        />
      </Svg>
      <Text
        className="text-xs font-semibold text-muted-foreground"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {seconds ?? ""}
      </Text>
    </View>
  );
}
