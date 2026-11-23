import type { QrCodePath } from "@repo/client";
import { cn } from "@repo/ui-native";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

/** A `qrCodePath` code on white, its quiet zone included, about 200 points wide. */
export function QrCode({
  qr,
  label,
  className,
}: {
  qr: QrCodePath;
  label: string;
  className?: string;
}) {
  // A whole number of points per module: react-native-svg has no crispEdges,
  // and fractional module edges antialias into seams between the rows.
  const side = qr.box * Math.max(3, Math.floor(200 / qr.box));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className={cn("overflow-hidden rounded-lg bg-white", className)}
    >
      <Svg width={side} height={side} viewBox={qr.viewBox}>
        <Path d={qr.path} fill="#000" />
      </Svg>
    </View>
  );
}
