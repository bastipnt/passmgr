import { totpSecretFromUri } from "@repo/crypto";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import { FieldBoxButton } from "@repo/ui/components/FieldBox";
import { FilePickerButton } from "@repo/ui/components/FilePickerButton";
import { CameraOffIcon, ImageUpIcon, ScanQrCodeIcon } from "lucide-react";
import { type ClipboardEvent, useEffect, useRef, useState } from "react";
import { decodeQr, decodeQrImage } from "./qr-decode";

/** Pause between two camera frames tried; decoding one takes a few ms. */
const SCAN_INTERVAL_MS = 200;

const NOT_A_TOTP_CODE = "That QR code doesn't set up a one-time code.";
const NO_CODE_IN_IMAGE = "No QR code found in that image.";

type Camera = "starting" | "on" | "unavailable";

type TotpQrScanButtonProps = {
  /** The secret of the scanned `otpauth://` code. */
  onScan: (secret: string) => void;
  disabled?: boolean;
};

/**
 * Trails the one-time code field: scans the site's setup QR code with the camera, or
 * reads it from an image (picked or pasted, a screenshot of the setup page). Only an
 * `otpauth://totp` code is taken; the frames never leave the device.
 */
export function TotpQrScanButton({ onScan, disabled }: TotpQrScanButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <FieldBoxButton aria-label="Scan QR code" disabled={disabled} onClick={() => setOpen(true)}>
        <ScanQrCodeIcon />
      </FieldBoxButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <QrScanner
            onScan={(secret) => {
              setOpen(false);
              onScan(secret);
            }}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function QrScanner({
  onScan,
  onCancel,
}: {
  onScan: (secret: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<Camera>("starting");
  const [error, setError] = useState<string>();
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  /** True once the text was a TOTP setup code (and handed over). */
  function take(text: string | undefined, missing: string) {
    if (text === undefined) {
      setError(missing);
      return false;
    }
    const secret = totpSecretFromUri(text);
    if (!secret) {
      setError(NOT_A_TOTP_CODE);
      return false;
    }
    onScanRef.current(secret);
    return true;
  }

  // Start the camera and try a frame every `SCAN_INTERVAL_MS` until a code reads.
  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");

    async function scan() {
      const video = videoRef.current;
      if (stopped || !video) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const text = await decodeQr(video, canvas).catch(() => undefined);
        if (stopped) return;
        // A frame without a code is the normal case; only a wrong code is worth saying.
        if (text !== undefined && take(text, "")) return;
      }
      timer = setTimeout(scan, SCAN_INTERVAL_MS);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        if (!stopped) setCamera("unavailable");
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setCamera("on");
      void scan();
    }

    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, []);

  async function readImage(file: Blob) {
    setError(undefined);
    const text = await decodeQrImage(file).catch(() => undefined);
    take(text, NO_CODE_IN_IMAGE);
  }

  function onPaste(event: ClipboardEvent) {
    const image = [...event.clipboardData.files].find((file) => file.type.startsWith("image/"));
    if (!image) return;
    event.preventDefault();
    void readImage(image);
  }

  return (
    <div onPaste={onPaste} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Scan QR code</DialogTitle>
        <DialogDescription>
          Hold the site&apos;s two-factor setup code up to the camera, or pick or paste a screenshot
          of it.
        </DialogDescription>
      </DialogHeader>
      <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-muted">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Camera preview"
          className={camera === "on" ? "size-full object-cover" : "hidden"}
        />
        {camera === "on" && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgb(0_0_0/0.35)]"
          />
        )}
        {camera === "unavailable" && (
          <div className="flex flex-col items-center gap-2 px-6 text-center text-muted-foreground text-sm">
            <CameraOffIcon className="size-6" aria-hidden />
            No camera available. Pick or paste a screenshot of the code instead.
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <DialogFooter>
        <FilePickerButton
          accept="image/*"
          label="QR code image"
          icon={<ImageUpIcon />}
          onFile={(file) => void readImage(file)}
          className="w-auto justify-center sm:mr-auto"
        >
          From image…
        </FilePickerButton>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}
