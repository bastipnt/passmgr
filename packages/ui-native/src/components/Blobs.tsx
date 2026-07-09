import { useWindowDimensions } from "react-native";
import Svg, { Defs, FeGaussianBlur, Filter, G, Rect } from "react-native-svg";

export type BlobsTone = "light" | "dark";

export type BlobsProps = {
  /** Base opacity preset. `light` = 0.10, `dark` = 0.16. */
  tone?: BlobsTone;
  /** Top-right blob color. Defaults to indigo-500. */
  indigo?: string;
  /** Bottom-left blob color. Defaults to violet-600. */
  violet?: string;
};

const TONE_OPACITY: Record<BlobsTone, number> = {
  light: 0.1,
  dark: 0.16,
};

/**
 * Decorative soft-blurred blobs for playful backgrounds. Full-bleed,
 * non-interactive. RN port of the web `Blobs` component — two rotated rounded
 * squares blurred via a Gaussian filter, anchored to opposite corners.
 */
export function Blobs({ tone = "light", indigo = "#6366f1", violet = "#7c3aed" }: BlobsProps) {
  const { width, height } = useWindowDimensions();
  const a = TONE_OPACITY[tone];

  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      style={{ position: "absolute", top: 0, left: 0 }}
    >
      <Defs>
        <Filter id="blobBlurA" x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation={8} />
        </Filter>
        <Filter id="blobBlurB" x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation={10} />
        </Filter>
      </Defs>

      {/* top-right blob */}
      <G
        opacity={a}
        transform={`translate(${width + 70 - 220}, ${-60}) rotate(22, 110, 110)`}
        filter="url(#blobBlurA)"
      >
        <Rect width={220} height={220} rx={64} fill={indigo} />
      </G>

      {/* bottom-left blob */}
      <G
        opacity={a * 0.9}
        transform={`translate(${-80}, ${height - 80 - 200}) rotate(-16, 100, 100)`}
        filter="url(#blobBlurB)"
      >
        <Rect width={200} height={200} rx={60} fill={violet} />
      </G>
    </Svg>
  );
}
