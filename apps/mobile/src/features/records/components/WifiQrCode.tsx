import { qrCodePath, wifiQrPayload } from "@repo/client";
import type { WifiRecord } from "@repo/schema";
import { Button, Section } from "@repo/ui-native";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { QrCode } from "@/components/QrCode";

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

  return (
    <Section title="Share network">
      <View className="items-start gap-3 px-5 py-4">
        {qr && <QrCode qr={qr} label={`QR code to join ${record.ssid}`} />}
        <Text className="text-muted-foreground text-sm">
          {qr
            ? "Scan with a phone's camera to join. Includes the password."
            : shown
              ? "This network's name or password can't be put in a QR code."
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
