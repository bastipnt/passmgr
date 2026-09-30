import { FIELD_COLORS } from "@repo/ui-shared";
import type { ReactElement } from "react";
import { StyleSheet, useColorScheme, useWindowDimensions, View } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { useCSSVariable } from "uniwind";

export type LightFieldIntensity = "vivid" | "dim";

export type LightFieldProps = {
  /**
   * `vivid` = the auth screens' full-strength field. `dim` = the signed-in
   * ground: weaker blobs under a glass-fill veil (web's `ShellBackdrop`).
   */
  intensity?: LightFieldIntensity;
};

/*
 * Web's `.light-field` at phone width (packages/ui/src/styles/globals.css):
 * four radial blobs, each `<rx> <ry> at <x> <y>` fading out at 70%.
 * Radii are the CSS rem sizes at 16px.
 */
const BLOBS = [
  { color: FIELD_COLORS.pink, rx: 608, ry: 512, x: 0.1, y: 0.3 },
  { color: FIELD_COLORS.amber, rx: 544, ry: 480, x: 0.25, y: 0.65 },
  { color: FIELD_COLORS.cyan, rx: 640, ry: 544, x: 0.8, y: 0.22 },
  { color: FIELD_COLORS.violet, rx: 576, ry: 512, x: 0.9, y: 0.75 },
] as const;

/** `--field-opacity` per intensity and theme. */
const OPACITY: Record<LightFieldIntensity, { light: number; dark: number }> = {
  vivid: { light: 0.45, dark: 0.5 },
  dim: { light: 0.28, dark: 0.28 },
};

/**
 * `--glass-fill` (white at 50% / 6%), laid over the dim field mid-screen. As
 * color + opacity: SVG stops ignore the alpha of an `rgba()` color.
 */
const VEIL_OPACITY = { light: 0.5, dark: 0.06 };

const EASE_STEPS = 8;

/**
 * Stops fading `color` from one [offset, opacity] to another along a
 * smoothstep curve. A plain two-stop gradient falls off linearly and shows a
 * visible rim where it ends; web hides that with `blur(40px)`, which is too
 * costly here.
 */
function easedStops(
  color: string,
  [fromOffset, fromOpacity]: Pair,
  [toOffset, toOpacity]: Pair,
): ReactElement[] {
  return Array.from({ length: EASE_STEPS + 1 }, (_, i) => {
    const t = i / EASE_STEPS;
    const eased = t * t * (3 - 2 * t);
    const offset = fromOffset + (toOffset - fromOffset) * t;
    return (
      <Stop
        key={`${color}-${offset}`}
        offset={offset}
        stopColor={color}
        stopOpacity={fromOpacity + (toOpacity - fromOpacity) * eased}
      />
    );
  });
}

type Pair = [offset: number, opacity: number];

/**
 * Full-screen backdrop of four soft color blobs, fading into `edge-tint` at
 * the top and bottom. Non-interactive and non-scrolling: render it as the
 * first child of a screen (see `Screen`), behind the scroll view.
 */
export function LightField({ intensity = "dim" }: LightFieldProps) {
  const { width, height } = useWindowDimensions();
  // `Appearance` carries the resolved scheme (the app mirrors its preference
  // into it); Uniwind's `theme` reads "light" while following the system.
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const background = useCSSVariable("--color-background") as string;
  const edge = useCSSVariable("--color-edge-tint") as string;

  const opacity = OPACITY[intensity][scheme];
  const veilOpacity = intensity === "dim" ? VEIL_OPACITY[scheme] : 0;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          {BLOBS.map((blob, i) => (
            <RadialGradient
              key={blob.color}
              id={`field-${i}`}
              cx="50%"
              cy="50%"
              r="50%"
              children={easedStops(blob.color, [0, opacity], [0.7, 0])}
            />
          ))}
          {/* Two single-color layers rather than one edge → veil gradient: SVG
              interpolates color and opacity separately, so fading an opaque
              color into translucent white passes through grey. */}
          <LinearGradient
            id="field-veil"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
            children={[
              ...easedStops("#ffffff", [0.04, 0], [0.3, veilOpacity]),
              ...easedStops("#ffffff", [0.7, veilOpacity], [0.96, 0]),
            ]}
          />
          <LinearGradient
            id="field-edge"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
            children={[
              ...easedStops(edge, [0.04, 1], [0.3, 0]),
              ...easedStops(edge, [0.7, 0], [0.96, 1]),
            ]}
          />
        </Defs>
        <Rect width={width} height={height} fill={background} />
        {BLOBS.map((blob, i) => (
          <Ellipse
            key={blob.color}
            cx={blob.x * width}
            cy={blob.y * height}
            rx={blob.rx}
            ry={blob.ry}
            fill={`url(#field-${i})`}
          />
        ))}
        <Rect width={width} height={height} fill="url(#field-veil)" />
        <Rect width={width} height={height} fill="url(#field-edge)" />
      </Svg>
    </View>
  );
}
