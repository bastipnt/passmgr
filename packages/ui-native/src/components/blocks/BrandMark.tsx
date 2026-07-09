import Svg, { Path, Rect } from "react-native-svg";
import { ColorTokens, getTokenValue, Token } from "tamagui";

export type BrandMarkProps = {
  size?: number;
  color?: ColorTokens;
};

/**
 * Padlock brand mark, drawn on a 24x24 grid so it stays crisp at any size.
 * Shackle is a stroked arc; the body is a rounded rect with a keyhole.
 */
export function BrandMark({ size = 70, color = "$background" }: BrandMarkProps) {
  const colorVal = getTokenValue(color as Token);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* shackle */}
      <Path
        d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10"
        stroke={colorVal}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* body */}
      <Rect x={4.5} y={10} width={15} height={10.5} rx={2.6} fill={colorVal} />
      {/* keyhole */}
      <Path
        d="M12 13.4a1.4 1.4 0 0 0-.7 2.6l-.5 2.1h2.4l-.5-2.1A1.4 1.4 0 0 0 12 13.4Z"
        fill="rgba(75,54,214,0.85)"
      />
    </Svg>
  );
}
