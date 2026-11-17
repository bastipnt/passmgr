import { Gunzip } from "fflate";

const INPUT_CHUNK = 16 * 1024;

export class GzipTooLargeError extends Error {
  override message = "GzipTooLargeError";
}

/**
 * `gunzipSync` that throws `GzipTooLargeError` once the output passes
 * `maxBytes`. Fed in small chunks: one push inflates its whole input before
 * reporting, and deflate expands up to ~1000×.
 */
export function gunzipBounded(data: Uint8Array, maxBytes: number): Uint8Array {
  let out = new Uint8Array(Math.min(maxBytes, Math.max(data.length * 4, 64 * 1024)));
  let length = 0;
  const gunzip = new Gunzip((chunk) => {
    const needed = length + chunk.length;
    if (needed > maxBytes) throw new GzipTooLargeError();
    if (needed > out.length) {
      const grown = new Uint8Array(Math.min(maxBytes, Math.max(needed, out.length * 2)));
      grown.set(out.subarray(0, length));
      out = grown;
    }
    out.set(chunk, length);
    length = needed;
  });
  for (let offset = 0; offset < data.length; offset += INPUT_CHUNK) {
    gunzip.push(data.subarray(offset, offset + INPUT_CHUNK));
  }
  gunzip.push(new Uint8Array(0), true);
  return out.subarray(0, length);
}
