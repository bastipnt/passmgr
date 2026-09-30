import { FIELD_COLORS } from "@repo/ui-shared";
import { useState } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";

import { FONT } from "../../lib/fonts";

export type SpectrumTextProps = {
  children: string;
  fontSize: number;
  /** Line box height; defaults to web's hero leading (0.95). */
  lineHeight?: number;
  /** Letter spacing in px. */
  letterSpacing?: number;
  fontFamily?: string;
};

/**
 * One line of text filled with web's `text-spectrum` gradient (pink → amber →
 * cyan → violet). RN can't clip a gradient to text without a masked view, so
 * it's drawn as SVG text. Single line only — it does not wrap.
 */
export function SpectrumText({
  children,
  fontSize,
  lineHeight = Math.round(fontSize * 0.95),
  letterSpacing = 0,
  fontFamily = FONT.display,
}: SpectrumTextProps) {
  const [width, setWidth] = useState(0);
  // Room for descenders below the line box, which the gradient text would clip.
  const height = Math.max(lineHeight, fontSize * 1.2);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={children}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: lineHeight, overflow: "visible" }}
    >
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="spectrum" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={FIELD_COLORS.pink} />
              <Stop offset="0.4" stopColor={FIELD_COLORS.amber} />
              <Stop offset="0.8" stopColor={FIELD_COLORS.cyan} />
              <Stop offset="1" stopColor={FIELD_COLORS.violet} />
            </LinearGradient>
          </Defs>
          <SvgText
            x={0}
            y={fontSize * 0.8}
            fill="url(#spectrum)"
            fontSize={fontSize}
            fontFamily={fontFamily}
            letterSpacing={letterSpacing}
          >
            {children}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}
