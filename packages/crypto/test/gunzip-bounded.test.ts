import { gzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { GzipTooLargeError, gunzipBounded } from "../src/util/gunzip-bounded";

describe("gunzipBounded", () => {
  const data = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 7919) % 251);

  it("inflates what fits", () => {
    expect(gunzipBounded(gzipSync(data), data.length)).toEqual(data);
  });

  it("stops a gzip bomb at the cap", () => {
    const bomb = gzipSync(new Uint8Array(8 * 1024 * 1024));

    expect(bomb.length).toBeLessThan(16 * 1024);
    expect(() => gunzipBounded(bomb, 256 * 1024)).toThrow(GzipTooLargeError);
  });

  it("refuses truncated data", () => {
    const zipped = gzipSync(data);

    expect(() => gunzipBounded(zipped.subarray(0, zipped.length >> 1), data.length)).toThrow();
  });
});
