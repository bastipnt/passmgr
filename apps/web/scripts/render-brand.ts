/**
 * Renders the brand sources in ../brand (plus public/favicon.svg) to the PNGs
 * in ../public: link-preview image, app icons, favicon fallback.
 * Not part of the build — run after changing a source and commit the output:
 *
 *   pnpm --filter web brand:render
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "@playwright/test";

const webRoot = path.resolve(import.meta.dirname, "..");
const brand = (file: string) => path.join(webRoot, "brand", file);
const pub = (file: string) => path.join(webRoot, "public", file);

// Same faces as the app (--font-display / --font-sans in packages/ui).
const uiRequire = createRequire(path.resolve(webRoot, "../../packages/ui/package.json"));
const fontFace = (family: string, pkg: string, file: string) => {
  const dir = path.dirname(uiRequire.resolve(pkg));
  const data = readFileSync(path.join(dir, "files", file)).toString("base64");
  return `@font-face{font-family:"${family}";font-weight:100 900;src:url(data:font/woff2;base64,${data}) format("woff2")}`;
};
const fonts = [
  fontFace(
    "Display",
    "@fontsource-variable/bricolage-grotesque",
    "bricolage-grotesque-latin-wght-normal.woff2",
  ),
  fontFace("Sans", "@fontsource-variable/dm-sans", "dm-sans-latin-wght-normal.woff2"),
].join("\n");

const svgPage = (svgFile: string) =>
  `<style>*{margin:0}html,body{width:100%;height:100%;overflow:hidden;background:transparent}img{display:block;width:100%;height:100%}</style>` +
  `<img src="data:image/svg+xml;base64,${readFileSync(svgFile).toString("base64")}">`;

type Target = { out: string; size: [number, number]; html: string };

const targets: Target[] = [
  {
    out: "og-image.png",
    size: [1200, 630],
    html: readFileSync(brand("og-image.html"), "utf8").replace(
      "</head>",
      `<style>${fonts}</style></head>`,
    ),
  },
  // Rounded tile with transparent corners: browser tabs and "any" icons.
  { out: "favicon-32.png", size: [32, 32], html: svgPage(pub("favicon.svg")) },
  { out: "icon-192.png", size: [192, 192], html: svgPage(pub("favicon.svg")) },
  { out: "icon-512.png", size: [512, 512], html: svgPage(pub("favicon.svg")) },
  // Opaque full-bleed square: iOS and Android mask it themselves.
  { out: "apple-touch-icon.png", size: [180, 180], html: svgPage(brand("icon-full-bleed.svg")) },
  { out: "icon-maskable-512.png", size: [512, 512], html: svgPage(brand("icon-full-bleed.svg")) },
];

const browser = await chromium.launch();
try {
  for (const { out, size, html } of targets) {
    const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
    await page.setContent(html, { waitUntil: "load" });
    // String form: this tsconfig has no DOM lib.
    await page.evaluate("document.fonts.ready");
    await page.screenshot({ path: pub(out), omitBackground: true });
    await page.close();
    console.log(`public/${out} (${size[0]}×${size[1]})`);
  }
} finally {
  await browser.close();
}
