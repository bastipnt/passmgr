import { BRAND_GRADIENT } from "@repo/ui-shared";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { BrandMark } from "./BrandMark";

export type AppIconProps = {
  size?: number;
};

/**
 * App-icon tile: a rounded-square brand-gradient background with the white padlock
 * BrandMark centered. Mirrors the real app icon so the login landing reads as branded.
 */
export function AppIcon({ size = 74 }: AppIconProps) {
  const radius = Math.round(size * 0.22);

  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        shadowColor: "rgba(79,70,229,0.5)",
        shadowOffset: { width: 0, height: 14 },
        shadowRadius: 30,
        shadowOpacity: 1,
      }}
    >
      <Svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="appIconGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BRAND_GRADIENT.from} />
            <Stop offset="0.55" stopColor={BRAND_GRADIENT.mid} />
            <Stop offset="1" stopColor={BRAND_GRADIENT.to} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} rx={radius} fill="url(#appIconGrad)" />
      </Svg>
      <BrandMark size={Math.round(size * 0.56)} />
    </View>
  );
}
