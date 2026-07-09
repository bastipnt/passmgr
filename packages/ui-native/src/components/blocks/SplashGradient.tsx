import { BRAND_GRADIENT } from "@repo/ui-shared";
import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/** Full-bleed diagonal brand gradient background. */
export function SplashGradient() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={BRAND_GRADIENT.from} />
          <Stop offset="0.55" stopColor={BRAND_GRADIENT.mid} />
          <Stop offset="1" stopColor={BRAND_GRADIENT.to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#brandGrad)" />
    </Svg>
  );
}
