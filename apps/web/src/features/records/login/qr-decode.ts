/** Longest side a frame is scaled to before decoding: enough for a setup code, quick to scan. */
const MAX_DECODE_SIDE = 800;

type Drawable = HTMLVideoElement | ImageBitmap;

function sizeOf(source: Drawable) {
  return source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : { width: source.width, height: source.height };
}

/**
 * The text of the QR code in a video frame or an image, or `undefined` when none is
 * found. jsQR is loaded on first use, so the record form doesn't carry it.
 */
export async function decodeQr(
  source: Drawable,
  canvas = document.createElement("canvas"),
): Promise<string | undefined> {
  const { width, height } = sizeOf(source);
  if (!width || !height) return undefined;
  const scale = Math.min(1, MAX_DECODE_SIDE / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { default: jsQR } = await import("jsqr");
  return jsQR(image.data, image.width, image.height)?.data;
}

/** The QR code in an image file (a screenshot of the setup page). */
export async function decodeQrImage(file: Blob): Promise<string | undefined> {
  const bitmap = await createImageBitmap(file);
  try {
    return await decodeQr(bitmap);
  } finally {
    bitmap.close();
  }
}
