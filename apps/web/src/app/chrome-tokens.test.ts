// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("../../../../packages/ui/src/styles/globals.css", import.meta.url),
  "utf8",
);

function token(name: string): string | undefined {
  return css.match(new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m"))?.[1];
}

describe("phone chrome tokens", () => {
  it("stacks bar < its labels < phone bar < its labels < dock < collapsing title", () => {
    const ladder = ["bar", "bar-label", "page-bar", "page-label", "dock", "page-title"].map(
      (name) => Number(token(`z-index-${name}`)),
    );
    expect(ladder).toEqual([10, 11, 20, 21, 25, 30]);
  });

  it("sizes the dock to its 56px FABs", () => {
    expect(token("dock-height")).toBe("3.5rem");
  });

  it.each([
    "../features/records/MobileVault.tsx",
    "../features/records/MobileRecordPage.tsx",
    "../features/records/RecordList.tsx",
    "./App.tsx",
  ])("%s takes its chrome offsets and layers from the tokens", (path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    expect(source).not.toMatch(/\bz-\d+\b/);
    expect(source).not.toMatch(/safe-area-inset-top|bottom-\[max\(env\(safe-area/);
    expect(source).not.toMatch(/\b56px\b/);
  });
});
