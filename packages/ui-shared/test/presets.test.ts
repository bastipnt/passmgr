import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PRESETS = ["berry", "violet", "cobalt", "pine", "ember", "graphite"] as const;
const MODES = ["light", "dark"] as const;

type Tokens = Record<string, string>;

const css = readFileSync(new URL("../src/tokens/presets.css", import.meta.url), "utf8");

function presetTokens(preset: string, mode: string): Tokens {
  const block = css.split(`[data-accent="${preset}"] {`)[1]?.split("\n}")[0] ?? "";
  const variant = block.split(`@variant ${mode} {`)[1]?.split("}")[0] ?? "";
  return Object.fromEntries(
    [...variant.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6});/g)].map(([, name, hex]) => [
      name,
      hex,
    ]),
  );
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe.each(PRESETS)("preset %s", (preset) => {
  it.each(MODES)("%s: text reads on the ground and on panels", (mode) => {
    const t = presetTokens(preset, mode);
    expect(Object.keys(t)).toHaveLength(9);

    for (const surface of [t.background, t.card]) {
      if (!surface) throw new Error("missing surface");
      expect(contrast(t["muted-foreground"] ?? "", surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["primary-text"] ?? "", surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(t["primary-foreground"] ?? "", t.primary ?? "")).toBeGreaterThanOrEqual(4.5);
  });
});
