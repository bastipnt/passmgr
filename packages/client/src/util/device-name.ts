// Order matters: Edge and Opera also claim Chrome, Chrome also claims Safari.
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

// iPadOS 13+ reports itself as macOS; it can't be told apart from the user agent.
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

const match = (rules: [RegExp, string][], ua: string) => rules.find(([re]) => re.test(ua))?.[1];

/** "Firefox on macOS": how this browser is named in the account's session list. */
export function deviceNameFromUserAgent(userAgent: string): string {
  const browser = match(BROWSERS, userAgent) ?? "Browser";
  const system = match(SYSTEMS, userAgent);
  return system ? `${browser} on ${system}` : browser;
}

/** What React Native's `Platform` reports: `release` is Android's `Platform.constants.Release`. */
export type NativePlatform = { os: string; version: string | number; release?: string };

/**
 * How this phone is named in the account's session list: platform and system
 * only. Not `Constants.deviceName`: the name the user gave the phone often
 * holds their real name, and the server would keep it in plaintext.
 */
export function deviceNameFromPlatform({ os, version, release }: NativePlatform): string {
  if (os === "ios") return `iPhone (iOS ${version})`;
  return `Android (Android ${release ?? version})`;
}
