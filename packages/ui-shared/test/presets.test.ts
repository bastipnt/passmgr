import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACCENT_COLORS,
  ACCENT_PRESETS,
  accentVariables,
  DEFAULT_ACCENT,
  parseAccent,
} from "../src/tokens/accents";

const MODES = ["light", "dark"] as const;

type Tokens = Record<string, string>;

const css = readFileSync(new URL("../src/tokens/presets.css", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../src/tokens/theme.css", import.meta.url), "utf8");

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

function mix(a: string, b: string, weight: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(channel(a, i) * weight + channel(b, i) * (1 - weight))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

describe.each(ACCENT_PRESETS)("preset %s", (preset) => {
  it.each(MODES)("%s: native colors match presets.css", (mode) => {
    expect(ACCENT_COLORS[preset][mode]).toEqual(presetTokens(preset, mode));
  });

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

  it("light: the default button's 92% fill keeps its label readable on white", () => {
    const t = presetTokens(preset, "light");
    const fill = mix(t.primary ?? "", "#ffffff", 0.92);
    expect(contrast(t["primary-foreground"] ?? "", fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("accentVariables", () => {
  const themeColors = [...themeCss.matchAll(/^\s*(--color-[\w-]+): unset;/gm)].map(
    ([, name]) => name,
  );

  it.each(MODES)("sets every theme color except destructive (%s)", (mode) => {
    const names = new Set(Object.keys(accentVariables("pine", mode)));
    expect(names).toEqual(new Set(themeColors.filter((name) => name !== "--color-destructive")));
  });

  it("derives like presets.css", () => {
    const vars = accentVariables("berry", "light");
    expect(vars["--color-border"]).toBe("#1e141a1a");
    expect(vars["--color-edge-tint"]).toBe("#f5f1f3");
    expect(vars["--color-primary-pressed"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(luminance(vars["--color-primary-pressed"] ?? "")).toBeLessThan(luminance("#b4307a"));
  });
});

describe("theme.css", () => {
  it.each(MODES)("holds the default preset (%s)", (mode) => {
    const block = themeCss
      .split("@layer theme {")
      .at(-1)
      ?.split(`@variant ${mode} {`)[1]
      ?.split("}")[0];
    const declared = Object.fromEntries(
      [...(block ?? "").matchAll(/(--color-[\w-]+): (#[0-9a-f]+);/g)].map(([, name, hex]) => [
        name,
        hex,
      ]),
    );
    const { "--color-destructive": _, ...colors } = declared;
    expect(colors).toEqual(accentVariables(DEFAULT_ACCENT, mode));
  });
});

describe("parseAccent", () => {
  it("keeps a known preset", () => {
    expect(parseAccent("pine")).toBe("pine");
  });

  it.each([null, "", "teal", 3])("falls back to the default for %s", (value) => {
    expect(parseAccent(value)).toBe(DEFAULT_ACCENT);
  });
});
