import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The text-field surface both platforms draw. Each keeps its own class string (web adds
 * focus-visible rings and shadows RN can't draw), so this checks the shared part.
 */
const SHARED_SURFACE = [
  "rounded-lg",
  "border",
  "border-foreground/12",
  "bg-field",
  "focus:bg-white",
  "focus:border-ring",
  "dark:border-white/14",
  "dark:bg-white/5",
];

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function literal(code: string, pattern: RegExp): string[] {
  const match = code.match(pattern)?.[1];
  if (match === undefined) throw new Error(`no class string for ${pattern}`);
  return match.split(/\s+/);
}

describe("field surface", () => {
  it("web's fieldClassName draws it", () => {
    const web = literal(
      source("../../ui/src/lib/field-styles.ts"),
      /export const fieldClassName =\s*"([^"]+)"/,
    ).map((cls) => cls.replace(/^focus-visible:/, "focus:"));

    expect(web).toEqual(expect.arrayContaining(SHARED_SURFACE));
  });

  it("native's fieldSurface + valid fieldBorder draw it", () => {
    const code = source("../../ui-native/src/components/forms/field-styles.ts");
    const native = [
      ...literal(code, /export const fieldSurface =\s*"([^"]+)"/),
      ...literal(code, /export const fieldBorder[\s\S]*?:\s*"([^"]+)"/),
    ];

    expect(native).toEqual(expect.arrayContaining(SHARED_SURFACE));
  });
});
