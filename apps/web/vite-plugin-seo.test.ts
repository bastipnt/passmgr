import { describe, expect, it } from "vitest";
import { authPaths } from "./src/app/route-paths";
import { seo } from "./vite-plugin-seo";

type Emitted = { fileName: string; source: string };

function emit(siteUrl: string | undefined): Record<string, string> {
  const files: Emitted[] = [];
  const plugin = seo(siteUrl);
  const generate = plugin.generateBundle as (this: unknown) => void;
  generate.call({ emitFile: (file: Emitted) => files.push(file) });
  return Object.fromEntries(files.map(({ fileName, source }) => [fileName, source]));
}

describe("seo", () => {
  it("allows the app's unlock and create pages in robots.txt", () => {
    const robots = emit(undefined)["robots.txt"];

    expect(robots).toContain(`Allow: ${authPaths.unlock}$`);
    expect(robots).toContain(`Allow: ${authPaths.create}$`);
    expect(robots).toContain("Disallow: /");
  });

  it("lists the same pages in the sitemap", () => {
    const sitemap = emit("https://example.com/")["sitemap.xml"];

    expect(sitemap).toContain(`<loc>https://example.com${authPaths.unlock}</loc>`);
    expect(sitemap).toContain(`<loc>https://example.com${authPaths.create}</loc>`);
  });
});
