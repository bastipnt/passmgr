import Svg, { Circle, Path } from "react-native-svg";
import { Uniwind } from "uniwind";

export type BiometricGlyphProps = {
  size?: number;
  /** Resolved color string (hex/rgb). Defaults to the `--color-primary` token. */
  color?: string;
};

/**
 * Face ID style glyph drawn on a 24x24 grid: four rounded corner brackets framing
 * two eyes and a smile. Indigo by default to sit on the white unlock circle.
 */
export function BiometricGlyph({ size = 42, color }: BiometricGlyphProps) {
  const colorVal = color ?? (Uniwind.getCSSVariable("--color-primary") as string);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* corner brackets */}
      <Path d="M3 8V6a3 3 0 0 1 3-3h2" stroke={colorVal} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M16 3h2a3 3 0 0 1 3 3v2" stroke={colorVal} strokeWidth={1.8} strokeLinecap="round" />
      <Path
        d="M21 16v2a3 3 0 0 1-3 3h-2"
        stroke={colorVal}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M8 21H6a3 3 0 0 1-3-3v-2"
        stroke={colorVal}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {/* eyes */}
      <Circle cx={9} cy={10} r={0.9} fill={colorVal} />
      <Circle cx={15} cy={10} r={0.9} fill={colorVal} />
      {/* smile */}
      <Path d="M9 14.5a4 4 0 0 0 6 0" stroke={colorVal} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
