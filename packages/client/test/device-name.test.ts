import { describe, expect, it } from "vitest";
import { deviceNameFromPlatform, deviceNameFromUserAgent } from "../src/util/device-name";

describe("deviceNameFromUserAgent", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0",
      "Firefox on macOS",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
      "Edge on Windows",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
      "Chrome on Android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari on iOS",
    ],
    ["curl/8.0", "Browser"],
  ])("%s → %s", (ua, expected) => {
    expect(deviceNameFromUserAgent(ua)).toBe(expected);
  });
});

describe("deviceNameFromPlatform", () => {
  it("names an iPhone by its iOS version", () => {
    expect(deviceNameFromPlatform({ os: "ios", version: "18.1" })).toBe("iPhone (iOS 18.1)");
  });

  it("names an Android phone by its release, not its API level", () => {
    expect(deviceNameFromPlatform({ os: "android", version: 34, release: "14" })).toBe(
      "Android (Android 14)",
    );
  });

  it("falls back to the API level when the release is missing", () => {
    expect(deviceNameFromPlatform({ os: "android", version: 34 })).toBe("Android (Android 34)");
  });
});
