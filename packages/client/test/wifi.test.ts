import { describe, expect, it } from "vitest";
import { qrCodePath, wifiQrPayload } from "../src/records/wifi";

describe("wifiQrPayload", () => {
  it("encodes a WPA network", () => {
    expect(
      wifiQrPayload({ type: "wifi", title: "x", ssid: "Home", password: "pw", security: "wpa2" }),
    ).toBe("WIFI:T:WPA;S:Home;P:pw;;");
  });

  it("escapes the format's delimiters", () => {
    const ssid = String.raw`a;b,c:d"e\f`;
    expect(wifiQrPayload({ type: "wifi", title: "x", ssid, password: "p;w" })).toBe(
      String.raw`WIFI:T:WPA;S:a\;b\,c\:d\"e\\f;P:p\;w;;`,
    );
  });

  it("marks an open or hidden network", () => {
    expect(wifiQrPayload({ type: "wifi", title: "x", ssid: "Cafe", hidden: true })).toBe(
      "WIFI:T:nopass;S:Cafe;H:true;;",
    );
    expect(
      wifiQrPayload({ type: "wifi", title: "x", ssid: "Old", password: "k", security: "wep" }),
    ).toBe("WIFI:T:WEP;S:Old;P:k;;");
  });

  it("is undefined without a network name", () => {
    expect(wifiQrPayload({ type: "wifi", title: "x", password: "pw" })).toBeUndefined();
  });
});

describe("qrCodePath", () => {
  it("draws a square code with the finder pattern in the corner", () => {
    const { size, path } = qrCodePath("WIFI:T:WPA;S:Home;P:pw;;");

    expect(size).toBeGreaterThanOrEqual(21);
    // Top-left finder: a run of 7 dark modules on the first row.
    expect(path.startsWith("M0 0h7v1h-7z")).toBe(true);
  });
});
