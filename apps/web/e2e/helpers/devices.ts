import { test as base, type Page } from "@playwright/test";

/**
 * `test` with a second device: its own browser context, so its own OPFS and
 * memory. A fixture, so it closes even when the test fails, with a screenshot
 * attached (the config's `screenshot` covers only the default page).
 */
export const test = base.extend<{ secondDevice: Page }>({
  secondDevice: async ({ browser, baseURL, permissions }, provide, testInfo) => {
    const context = await browser.newContext({ baseURL, permissions });
    const page = await context.newPage();
    try {
      await provide(page);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("second-device", {
          body: await page.screenshot().catch(() => Buffer.alloc(0)),
          contentType: "image/png",
        });
      }
      await context.close();
    }
  },
});
