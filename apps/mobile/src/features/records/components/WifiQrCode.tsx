import { qrCodePath, wifiQrPayload } from "@repo/client";
import type { WifiRecord } from "@repo/schema";
import { Button, Section } from "@repo/ui-native";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

/** Quiet zone around the code, in modules; scanners want at least 4. */
const QUIET_ZONE = 4;

/**
 * Web's "Share network": a QR code another phone joins the network from. It
 * holds the password in the clear, so it stays hidden until asked for.
 */
export function WifiQrCode({ record }: { record: WifiRecord }) {
  const [shown, setShown] = useState(false);
  const payload = wifiQrPayload(record);
  const qr = useMemo(() => {
    if (!shown || !payload) return undefined;
    try {
      return qrCodePath(payload);
    } catch {
      // Text the encoder can't take (a lone surrogate in the name): no code.
      return undefined;
    }
  }, [shown, payload]);

  if (!payload) return null;

  const box = (qr?.size ?? 0) + QUIET_ZONE * 2;
  // A whole number of points per module: react-native-svg has no crispEdges,
  // and fractional module edges antialias into seams between the rows.
  const side = box * Math.max(3, Math.floor(200 / Math.max(box, 1)));

  return (
    <Section title="Share network">
      <View className="items-start gap-3 px-5 py-4">
        {qr && (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`QR code to join ${record.ssid}`}
            className="overflow-hidden rounded-lg bg-white"
          >
            <Svg width={side} height={side} viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}>
              <Path d={qr.path} fill="#000" />
            </Svg>
          </View>
        )}
        <Text className="text-muted-foreground text-sm">
          {qr
            ? "Scan with a phone's camera to join. Includes the password."
            : "Show a QR code another phone can scan to join this network."}
        </Text>
        <Button
          variant="glass"
          systemImage={shown ? "eye.slash" : "qrcode"}
          onPress={() => setShown(!shown)}
        >
          {shown ? "Hide QR code" : "Show QR code"}
        </Button>
      </View>
    </Section>
  );
}
