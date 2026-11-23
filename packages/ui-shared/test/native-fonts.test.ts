import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FONT } from "../src/tokens/native-fonts";

const mobile = new URL("../../../apps/mobile/", import.meta.url);
const globalCss = readFileSync(new URL("src/global.css", mobile), "utf8");
const appJson: unknown = JSON.parse(readFileSync(new URL("app.json", mobile), "utf8"));

function embeddedFonts(): string[] {
  const plugins = (appJson as { expo: { plugins: unknown[] } }).expo.plugins;
  const entry = plugins.find((p) => Array.isArray(p) && p[0] === "expo-font") as
    | [string, { fonts: string[] }]
    | undefined;
  return entry?.[1].fonts ?? [];
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe("FONT", () => {
  it("matches the --font-* families in the mobile global.css", () => {
    const declared = Object.fromEntries(
      [...globalCss.matchAll(/^\s*--font-([\w-]+):\s*([\w-]+);/gm)].map(([, name, family]) => [
        name,
        family,
      ]),
    );
    const expected = Object.fromEntries(
      Object.entries(FONT).map(([key, family]) => [kebab(key), family]),
    );
    expect(declared).toEqual(expected);
  });

  it.each(Object.values(FONT))("embeds %s from a font file of that name", (family) => {
    const file = `./assets/fonts/${family}.ttf`;
    expect(embeddedFonts()).toContain(file);
    expect(existsSync(new URL(file, mobile))).toBe(true);
  });

  it("embeds no font it doesn't name", () => {
    expect(embeddedFonts()).toHaveLength(Object.keys(FONT).length);
  });
});
