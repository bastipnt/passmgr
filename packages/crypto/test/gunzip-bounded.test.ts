import { gzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { GzipTooLargeError, gunzipBounded } from "../src/util/gunzip-bounded";

describe("gunzipBounded", () => {
  // Above the 64 KiB first buffer, so the output grows once. Built at collection (no time limit).
  const data = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 7919) % 251);
  const zipped = gzipSync(data);

  it("inflates what fits", () => {
    const inflated = gunzipBounded(zipped, data.length);

    // toEqual walks a typed array element by element: seconds for 200 kB under a full run.
    expect(Buffer.compare(inflated, data)).toBe(0);
  });

  it("stops a gzip bomb at the cap", () => {
    const bomb = gzipSync(new Uint8Array(8 * 1024 * 1024));

    expect(bomb.length).toBeLessThan(16 * 1024);
    expect(() => gunzipBounded(bomb, 256 * 1024)).toThrow(GzipTooLargeError);
  });

  it("refuses truncated data", () => {
    expect(() => gunzipBounded(zipped.subarray(0, zipped.length >> 1), data.length)).toThrow();
  });
});
