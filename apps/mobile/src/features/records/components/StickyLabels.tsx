import { BlurView } from "expo-blur";
import { useHeaderHeight } from "expo-router/react-navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
import { useColorScheme, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useCSSVariable } from "uniwind";

/** How far below the label the frost fades out (web: `--sticky-bar-fade`). */
const FADE = 16;

/** Scroll distance over which the frost fades in once the first label pins (web: 2rem). */
const FROST_FADE_IN = 32;

/** Full blur strength of the frost. */
const BLUR_INTENSITY = 80;

/**
 * Tint washed over the blur, under the bar / behind the label. Kept light so
 * the frost stays see-through; dark mode's edge tint is darker than the field
 * it sits on, so it gets less.
 */
const WASH_OPACITY = {
  light: { bar: 0.5, label: 0.4 },
  dark: { bar: 0.3, label: 0.2 },
} as const;

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type StickyContextValue = {
  /** Content offset under the bar's bottom edge (see `useScrollTitle`). */
  scrollY: SharedValue<number>;
  /** Where the list starts inside the scroll content. */
  listY: SharedValue<number>;
  listHeight: SharedValue<number>;
  /** Layout y of each label inside the list, by index. */
  labelYs: SharedValue<Record<number, number>>;
  labelHeight: SharedValue<number>;
  /** `labelHeight` for the JS thread (the frost's gradient stops). */
  labelHeightJs: number;
  setLabelHeightJs: (height: number) => void;
  /** Number of labels — bounds the "next label" lookup against stale entries. */
  count: number;
};

const StickyContext = createContext<StickyContextValue | null>(null);

type StickyListProps = {
  scrollY: SharedValue<number>;
  /** How many `StickyLabel`s the list renders. */
  count: number;
  /** Labels and rows as flat siblings — zIndex only orders siblings. */
  children: ReactNode;
};

/**
 * A list whose `StickyLabel`s pin under the header while their rows scroll by
 * and get pushed out by the next label — web's `sticky-label`.
 *
 * Labels and rows must be direct (flat) children: the one shared frost sits
 * between them in z-order (rows < frost < labels), which RN can only do for
 * siblings. A single frost also means no hand-over between labels, so it never
 * blinks while a label is pushed out.
 */
export function StickyList({ scrollY, count, children }: StickyListProps) {
  const listY = useSharedValue(0);
  const listHeight = useSharedValue(0);
  const labelYs = useSharedValue<Record<number, number>>({});
  const labelHeight = useSharedValue(0);
  const [labelHeightJs, setLabelHeightJs] = useState(0);

  return (
    <StickyContext
      value={{
        scrollY,
        listY,
        listHeight,
        labelYs,
        labelHeight,
        labelHeightJs,
        setLabelHeightJs,
        count,
      }}
    >
      <View
        onLayout={(event) => {
          listY.value = event.nativeEvent.layout.y;
          listHeight.value = event.nativeEvent.layout.height;
        }}
      >
        {children}
        {count > 0 && <ListFrost />}
      </View>
    </StickyContext>
  );
}

type StickyLabelProps = {
  index: number;
  children: ReactNode;
};

/** A group label that pins under the header inside a `StickyList`. */
export function StickyLabel({ index, children }: StickyLabelProps) {
  const sticky = useContext(StickyContext);
  if (!sticky) throw new Error("StickyLabel must be rendered inside a StickyList");
  const { scrollY, listY, listHeight, labelYs, labelHeight, setLabelHeightJs, count } = sticky;

  const style = useAnimatedStyle(() => {
    const top = labelYs.value[index] ?? 0;
    const next = index + 1 < count ? (labelYs.value[index + 1] ?? top) : listHeight.value;
    const pinnedFor = scrollY.value - listY.value - top;
    const max = Math.max(0, next - top - labelHeight.value);
    // Fades out over the last label-height as the next label pushes it up.
    const opacity = Math.min(1, Math.max(0, (max - pinnedFor) / Math.max(labelHeight.value, 1)));
    return { opacity, transform: [{ translateY: Math.min(Math.max(pinnedFor, 0), max) }] };
  });

  return (
    <Animated.View
      onLayout={(event) => {
        const { y, height } = event.nativeEvent.layout;
        // Atomic on the UI thread: labels lay out in the same batch, and a
        // read-spread-write from each onLayout would drop the others' entries.
        labelYs.modify((ys) => {
          "worklet";
          ys[index] = y;
          return ys;
        }, true);
        labelHeight.value = height;
        setLabelHeightJs(height);
      }}
      style={[{ zIndex: 2 }, style]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The pinned labels' ground — web's masked sticky-bar frost: a native blur
 * from under the bar down through the label, washed with the page's edge
 * tint, and a tint fade below it so rows ease into the frost rather than
 * meeting a bare edge. It follows the bar and fades in (blur intensity + wash
 * opacity, never the blur view's own opacity, which UIKit renders wrong) once
 * the first label pins.
 */
function ListFrost() {
  const { scrollY, listY, labelYs, labelHeight, labelHeightJs } = useContext(StickyContext)!;
  const headerHeight = useHeaderHeight();
  const edge = useCSSVariable("--color-edge-tint") as string;
  const { bar, label } = WASH_OPACITY[useColorScheme() === "dark" ? "dark" : "light"];

  const frameStyle = useAnimatedStyle(() => ({
    height: headerHeight + labelHeight.value + FADE,
    transform: [{ translateY: Math.max(scrollY.value - listY.value, 0) }],
  }));
  const blurStyle = useAnimatedStyle(() => ({ height: headerHeight + labelHeight.value }));
  // Fade-in progress, inlined in each mapper: Reanimated only re-runs a
  // mapper for shared values it reads itself, not inside a helper worklet.
  const blurProps = useAnimatedProps(() => {
    const pinnedFor = scrollY.value - listY.value - (labelYs.value[0] ?? 0);
    return { intensity: BLUR_INTENSITY * Math.min(1, Math.max(0, pinnedFor / FROST_FADE_IN)) };
  });
  const washStyle = useAnimatedStyle(() => {
    const pinnedFor = scrollY.value - listY.value - (labelYs.value[0] ?? 0);
    return { opacity: Math.min(1, Math.max(0, pinnedFor / FROST_FADE_IN)) };
  });

  // Solid wash down to the label's bottom edge, then the fade.
  const solidEnd = (headerHeight + labelHeightJs) / (headerHeight + labelHeightJs + FADE);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", zIndex: 1, left: 0, right: 0, top: -headerHeight },
        frameStyle,
      ]}
    >
      <AnimatedBlurView
        tint="systemUltraThinMaterial"
        animatedProps={blurProps}
        style={[{ position: "absolute", top: 0, left: 0, right: 0 }, blurStyle]}
      />
      <Animated.View style={[{ flex: 1 }, washStyle]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="label-frost" x1="0" y1="0" x2="0" y2="1">
              <Stop offset={0} stopColor={edge} stopOpacity={bar} />
              <Stop offset={solidEnd} stopColor={edge} stopOpacity={label} />
              <Stop
                offset={solidEnd + (1 - solidEnd) * 0.5}
                stopColor={edge}
                stopOpacity={label / 2}
              />
              <Stop offset={1} stopColor={edge} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#label-frost)" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}
