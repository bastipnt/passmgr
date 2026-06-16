/**
 * DDG returns a 48x48 PNG placeholder when it has no favicon for the domain
 * (despite responding with HTTP 404, the body is a valid PNG, so <img> fires
 * `load` not `error`). Real favicons from DDG pass through at 16 or 32 px.
 */
export function isDdgPlaceholder(img: HTMLImageElement) {
  return img.naturalWidth === 48 && img.naturalHeight === 48;
}

export function loadImage(src: string) {
  return new Promise<"ok" | "fail">((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(isDdgPlaceholder(img) ? "fail" : "ok");
    img.onerror = () => reject();
    img.src = src;
  });
}
