import { qrCodePath, wifiQrPayload } from "@repo/client";
import type { WifiRecord } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import { EyeOffIcon, QrCodeIcon } from "lucide-react";
import { useMemo, useState } from "react";

/** Quiet zone around the code, in modules; scanners want at least 4. */
const QUIET_ZONE = 4;

/**
 * "Share network": a QR code phones join the network from. It holds the
 * password in the clear, so it stays hidden until asked for, like a secret
 * field (any camera in view could read it).
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

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
        Share network
      </h2>
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-foreground/10 p-4 dark:border-white/10">
        {qr && (
          <svg
            viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}
            className="size-48 rounded-lg bg-white"
            shapeRendering="crispEdges"
          >
            <title>{`QR code to join ${record.ssid}`}</title>
            <path d={qr.path} fill="#000" />
          </svg>
        )}
        <p className="text-muted-foreground text-sm">
          {qr
            ? "Scan with a phone's camera to join. Includes the password."
            : "Show a QR code a phone can scan to join this network."}
        </p>
        <Button variant="outline" size="sm" type="button" onClick={() => setShown(!shown)}>
          {shown ? <EyeOffIcon /> : <QrCodeIcon />}
          {shown ? "Hide QR code" : "Show QR code"}
        </Button>
      </div>
    </section>
  );
}
