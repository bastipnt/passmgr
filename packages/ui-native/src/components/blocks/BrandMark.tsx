import { BRAND_COLOR } from "@repo/ui-shared";
import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { cn } from "../../lib/utils";

/** Same path as web's `BrandMark` (packages/ui) — a shield with a keyhole cut-out. */
const SHIELD_KEYHOLE =
  "M12 2.6 19.6 5.5v5.9c0 4.8-3.2 8.8-7.6 10.1-4.4-1.3-7.6-5.3-7.6-10.1V5.5zM14.3 9.8a2.3 2.3 0 1 0-3.4 2l-.7 3.9h3.6l-.7-3.9a2.3 2.3 0 0 0 1.2-2z";

export type BrandGlyphProps = {
  size?: number;
  color?: string;
};

/** The bare shield glyph, drawn on a 24x24 grid. */
export function BrandGlyph({ size = 24, color = "#ffffff" }: BrandGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={SHIELD_KEYHOLE} fill={color} fillRule="evenodd" />
    </Svg>
  );
}

export type BrandMarkProps = {
  /** Tile edge in px. Web default is 36. */
  size?: number;
};

/** White shield on a solid violet tile — RN port of web's `BrandMark`. */
export function BrandMark({ size = 36 }: BrandMarkProps) {
  return (
    <View
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        borderCurve: "continuous",
        backgroundColor: BRAND_COLOR,
      }}
    >
      <BrandGlyph size={size * 0.74} />
    </View>
  );
}

export type BrandLockupProps = {
  className?: string;
  size?: number;
};

/** Brand mark plus the "passmgr" wordmark. */
export function BrandLockup({ className, size = 36 }: BrandLockupProps) {
  return (
    <View className={cn("flex-row items-center gap-3", className)}>
      <BrandMark size={size} />
      <Text className="font-display-bold text-[20px] text-foreground tracking-[-0.4px]">
        passmgr
      </Text>
    </View>
  );
}
