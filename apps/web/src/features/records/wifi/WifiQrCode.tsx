import { qrCodePath, wifiQrPayload } from "@repo/client";
import type { WifiRecord } from "@repo/schema";
import { Button } from "@repo/ui/components/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@repo/ui/components/Dialog";
import { Maximize2Icon, QrCodeIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Quiet zone around the code, in modules; scanners want at least 4. */
const QUIET_ZONE = 4;

function QrCodeSvg({ payload, ssid }: { payload: string; ssid: string }) {
  const qr = useMemo(() => {
    try {
      return qrCodePath(payload);
    } catch {
      // Text the encoder can't take (a lone surrogate in the name): no code.
      return undefined;
    }
  }, [payload]);
  if (!qr)
    return (
      <p className="text-muted-foreground text-sm">This network can't be shown as a QR code.</p>
    );

  const box = qr.size + QUIET_ZONE * 2;
  return (
    <svg
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}
      className="aspect-square w-full max-w-[min(80vw,26rem)] rounded-xl bg-white"
      shapeRendering="crispEdges"
    >
      <title>{`QR code to join ${ssid}`}</title>
      <path d={qr.path} fill="#000" />
    </svg>
  );
}

/** Closes as soon as the page loses focus or is hidden: the code is the password in the clear. */
function useCloseWhenAway(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onVisibility = () => document.visibilityState === "hidden" && close();
    window.addEventListener("blur", close);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", close);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [open, close]);
}

/**
 * "Join with a QR code": a code phone cameras join the network from. It holds
 * the password, so the card shows none; the code opens full screen, only while
 * the page is in view.
 */
export function WifiQrCode({ record }: { record: WifiRecord }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useCloseWhenAway(open, close);
  const payload = wifiQrPayload(record);
  if (!payload || !record.ssid) return null;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-foreground/10 bg-white/65 p-4 shadow-xs dark:border-white/10 dark:bg-white/3">
      <span
        aria-hidden
        className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-text [&_svg]:size-7"
      >
        <QrCodeIcon />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p className="font-bold font-display text-[1.0625rem] tracking-[-0.015em]">
          Join with a QR code
        </p>
        <p className="text-muted-foreground text-sm">
          Guests scan it with their camera to join {record.ssid}. It holds the password, so it opens
          full screen and only while you look.
        </p>
        <Button variant="outline" size="sm" className="mt-1.5" onClick={() => setOpen(true)}>
          <Maximize2Icon />
          Show full screen
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-w-xl flex-col items-center gap-4 text-center">
          <DialogTitle>{record.ssid}</DialogTitle>
          <DialogDescription>
            Scan with a phone's camera to join. Includes the password.
          </DialogDescription>
          {open && <QrCodeSvg payload={payload} ssid={record.ssid} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
