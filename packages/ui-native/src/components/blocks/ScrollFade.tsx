import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useCSSVariable } from "uniwind";

type ScrollFadeProps = {
  /** Which edge the content fades into. */
  edge?: "top" | "bottom";
  /** Fade height in px. */
  height?: number;
  /** CSS variable name of the color the content fades into. */
  colorVariable?: string;
};

/** Opacity ramp, opaque at the faded edge → transparent towards the content. */
const STOPS = {
  top: [
    { offset: "0", opacity: 1 },
    { offset: "0.6", opacity: 0.85 },
    { offset: "1", opacity: 0 },
  ],
  bottom: [
    { offset: "0", opacity: 0 },
    { offset: "0.4", opacity: 0.85 },
    { offset: "1", opacity: 1 },
  ],
} as const;

/**
 * Floats over a scroll view and fades the scrolling content into the
 * background at the given edge — the same effect the native tab bar
 * produces on the records screen.
 */
function ScrollFade({
  edge = "top",
  height = 80,
  colorVariable = "--color-background",
}: ScrollFadeProps) {
  const color = useCSSVariable(colorVariable) as string;
  const id = `scrollFade-${edge}`;

  return (
    <View pointerEvents="none" className="absolute right-0 left-0" style={{ height, [edge]: 0 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {STOPS[edge].map(({ offset, opacity }) => (
              <Stop key={offset} offset={offset} stopColor={color} stopOpacity={opacity} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export { ScrollFade };
