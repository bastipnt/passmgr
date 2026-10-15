/**
 * What a login's website value can hold: a web page, an app, or any other
 * `scheme:` address (`ssh://`, `ftp://`, `mailto:`, a custom scheme).
 */
export type Website =
  | { kind: "web"; url: string; host: string }
  | { kind: "app"; platform: "android" | "ios"; appId: string }
  | { kind: "uri"; scheme: string; value: string };

const BARE_HOST =
  /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i;

// Looser than `BARE_HOST` (no TLD needed: `intranet`, `nas:8080`), for what someone types into a website field.
const TYPED_HOST = /^[^\s:/?#@]+(:\d+)?([/?#]\S*)?$/;

const SCHEME_URI = /^([a-z][a-z0-9+.-]*):(?:\/\/)?(\S+)$/i;

// `android://<cert hash>@<package>/` is how Chrome and Firefox store Android app logins.
const APP_SCHEMES: Record<string, "android" | "ios"> = {
  android: "android",
  androidapp: "android",
  "android-app": "android",
  iosapp: "ios",
  "ios-app": "ios",
};

/** A website value read by kind; `undefined` for text that is none of them. */
export function parseWebsite(raw: string): Website | undefined {
  const value = raw.trim();
  const url = websiteUrl(value);
  if (url) {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host ? { kind: "web", url, host } : undefined;
  }
  const [, rawScheme, rest] = SCHEME_URI.exec(value) ?? [];
  if (!rawScheme || !rest) return undefined;
  const scheme = rawScheme.toLowerCase();
  if (scheme === "http" || scheme === "https") return undefined;
  const platform = APP_SCHEMES[scheme];
  if (!platform) return { kind: "uri", scheme, value };
  const appId = rest.replace(/^[^@/]*@/, "").split(/[/?#]/)[0];
  return appId ? { kind: "app", platform, appId } : undefined;
}

/** What a form saves: `https://` added to a typed host, anything else as typed. */
export function normalizeWebsite(raw: string): string {
  const value = raw.trim();
  return TYPED_HOST.test(value) ? `https://${value}` : value;
}

/** A web website's host for matching: lowercase, no `www.`, port or path; `undefined` for any other kind. */
export function websiteHost(raw: string): string | undefined {
  const website = parseWebsite(raw);
  return website?.kind === "web" ? website.host : undefined;
}

/** An http(s) URL for a website, `https://` added to a bare host; `undefined` for anything else. */
export function websiteUrl(raw: string): string | undefined {
  const value = raw.trim();
  const candidate = /^https?:\/\//i.test(value)
    ? value
    : BARE_HOST.test(value)
      ? `https://${value}`
      : undefined;
  if (!candidate) return undefined;
  try {
    return new URL(candidate).protocol.startsWith("http") ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/** How a website reads in a record, with a link only for http(s): nothing else is safe to open. */
export function websiteLink(raw: string): { text: string; href?: string } {
  const website = parseWebsite(raw);
  switch (website?.kind) {
    case "web":
      return { text: raw.trim(), href: website.url };
    case "app":
      return {
        text: `${website.platform === "android" ? "Android" : "iOS"} app: ${website.appId}`,
      };
    default:
      return { text: raw.trim() };
  }
}
