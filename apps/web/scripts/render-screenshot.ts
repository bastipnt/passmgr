/**
 * Takes the README screenshot of the public demo (docs/images/*.png).
 * Not part of the build — run after a visible UI change and commit the output:
 *
 *   pnpm --filter web screenshot:render [url]
 *
 * `url` defaults to the public demo; pass http://localhost:5179 for a local
 * `web-demo` dev server (VITE_DEMO_MODE=true).
 */
import path from "node:path";
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "https://passmgr.bastipnt.de";
const out = path.resolve(import.meta.dirname, "../../../docs/images");

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: /try the demo/i }).click();
  // Argon2 runs on demo creation, so give it room. Records appear once seeded.
  await page.getByText("Amazon").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: path.join(out, "vault.png") });
  console.log(`wrote ${path.join(out, "vault.png")}`);
} finally {
  await browser.close();
}
