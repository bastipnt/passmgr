/**
 * Refreshes the bundled 2fa.directory snapshot: every site that supports TOTP,
 * domain → setup documentation. The data is MIT licensed (2factorauth/twofactorauth);
 * keep the attribution in the file and in the UI.
 *
 *   bun ./scripts/update-two-factor-directory.ts
 */
import { writeFile } from "node:fs/promises";

const SOURCE = "https://api.2fa.directory/v3/totp.json";
const OUT = new URL("../src/records/two-factor-directory.json", import.meta.url);

type Entry = { domain: string; "additional-domains"?: string[]; documentation?: string };

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE} answered ${response.status}`);
const entries = (await response.json()) as [string, Entry][];

// Rendered as a link href: anything but https would be a javascript: / plain-HTTP hole.
const safeLink = (url: string | undefined) => (url?.startsWith("https://") ? url : "");

const sites: Record<string, string> = {};
for (const [, entry] of entries) {
  for (const domain of [entry.domain, ...(entry["additional-domains"] ?? [])]) {
    const host = domain
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");
    if (host && !host.includes("/")) sites[host] ??= safeLink(entry.documentation);
  }
}

const sorted = Object.fromEntries(Object.entries(sites).sort(([a], [b]) => a.localeCompare(b)));
const snapshot = {
  source: "https://2fa.directory",
  license: "MIT, https://github.com/2factorauth/twofactorauth",
  updatedAt: new Date().toISOString().slice(0, 10),
  sites: sorted,
};
await writeFile(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} sites → ${OUT.pathname}`);
