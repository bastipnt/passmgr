import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVATAR_FALLBACK } from "../src/tokens/avatar";

const webCss = readFileSync(new URL("../../ui/src/styles/globals.css", import.meta.url), "utf8");

function fallbackVars(selector: string): Record<string, number> {
  const block = webCss.split(`\n${selector} {`)[1]?.split("}")[0] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/--avatar-fallback-([\w-]+):\s*([\d.]+);/g)].map(([, name, value]) => [
      name,
      Number(value),
    ]),
  );
}

describe("AVATAR_FALLBACK", () => {
  it.each([
    ["light", ":root"],
    ["dark", ".dark"],
  ] as const)("%s matches web's --avatar-fallback-* on %s", (mode, selector) => {
    const { bg, fg } = AVATAR_FALLBACK[mode];
    expect(fallbackVars(selector)).toEqual({
      "l-bg": bg.l,
      "c-bg": bg.c,
      "l-fg": fg.l,
      "c-fg": fg.c,
    });
  });
});
