import type { WifiRecord } from "@repo/schema";
import { encode } from "uqr";

/** `\`, `;`, `,`, `:` and `"` are the format's delimiters; a backslash escapes them. */
function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/**
 * The text of a "join this network" QR code (the `WIFI:` format phone cameras
 * read). WPA2 and WPA3 are both sent as `WPA`: that is what iOS and Android
 * read, and it joins WPA3 / transition networks too. `undefined` without a
 * network name, which the code can't do without.
 */
export function wifiQrPayload(record: WifiRecord): string | undefined {
  if (!record.ssid) return undefined;

  const password = record.password ?? "";
  const security =
    record.security === "none" || (!record.security && !password)
      ? "nopass"
      : record.security === "wep"
        ? "WEP"
        : "WPA";

  const parts = [`T:${security}`, `S:${escapeWifiValue(record.ssid)}`];
  if (security !== "nopass") parts.push(`P:${escapeWifiValue(password)}`);
  if (record.hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

/** Light margin around a QR code, in modules; scanners want at least 4. */
export const QR_QUIET_ZONE = 4;

export type QrCodePath = {
  /** Modules per side of the code itself. */
  size: number;
  /** Modules per side with the quiet zone on both sides. */
  box: number;
  /** SVG viewBox that puts the quiet zone around the path. */
  viewBox: string;
  /** SVG path data in module units, one unit per module, the code's corner at 0 0. */
  path: string;
};

/**
 * A QR code as one SVG path, so web (`<svg>`) and mobile (react-native-svg)
 * draw it the same way. Runs of dark modules in a row become one rectangle.
 */
export function qrCodePath(text: string): QrCodePath {
  const { data, size } = encode(text, { border: 0, ecc: "M" });
  let path = "";
  data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      path += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  const box = size + QR_QUIET_ZONE * 2;
  return { size, box, viewBox: `${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${box} ${box}`, path };
}
