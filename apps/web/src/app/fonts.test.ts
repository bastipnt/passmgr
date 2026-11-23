// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { FONT_FACES } from "@repo/ui/lib/fonts";
import { describe, expect, it } from "vitest";

const uiRoot = path.resolve(import.meta.dirname, "../../../../packages/ui");
const uiRequire = createRequire(path.join(uiRoot, "package.json"));
const globalsCss = readFileSync(path.join(uiRoot, "src/styles/globals.css"), "utf8");

describe.each(Object.entries(FONT_FACES))("FONT_FACES.%s", (_, { pkg, file }) => {
  it("is a face the app's stylesheet imports", () => {
    expect(globalsCss).toContain(`@import "${pkg}";`);
  });

  it("names a woff2 the package ships", () => {
    const dir = path.dirname(uiRequire.resolve(pkg));
    expect(existsSync(path.join(dir, "files", `${file}.woff2`))).toBe(true);
  });
});
