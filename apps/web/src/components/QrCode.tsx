import type { QrCodePath } from "@repo/client";
import { cn } from "@repo/ui/lib/utils";

/** A `qrCodePath` code on white, its quiet zone included. */
export function QrCode({
  qr,
  title,
  className,
}: {
  qr: QrCodePath;
  title: string;
  className?: string;
}) {
  return (
    <svg viewBox={qr.viewBox} className={cn("bg-white", className)} shapeRendering="crispEdges">
      <title>{title}</title>
      <path d={qr.path} fill="#000" />
    </svg>
  );
}
