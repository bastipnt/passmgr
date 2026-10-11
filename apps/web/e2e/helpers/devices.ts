import { type Browser, test as base, type Page, type TestInfo } from "@playwright/test";

type DeviceOptions = { browser: Browser; baseURL?: string; permissions?: string[] };

/**
 * Another device: its own browser context, so its own OPFS and memory. Closes
 * even when the test fails, with a screenshot attached (the config's
 * `screenshot` covers only the default page).
 */
async function device(
  name: string,
  { browser, baseURL, permissions }: DeviceOptions,
  provide: (page: Page) => Promise<void>,
  testInfo: TestInfo,
): Promise<void> {
  const context = await browser.newContext({ baseURL, permissions });
  const page = await context.newPage();
  try {
    await provide(page);
  } finally {
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach(name, {
        body: await page.screenshot().catch(() => Buffer.alloc(0)),
        contentType: "image/png",
      });
    }
    await context.close();
  }
}

/** `test` with a second and a third device (only created when a test asks for them). */
export const test = base.extend<{ secondDevice: Page; thirdDevice: Page }>({
  secondDevice: async ({ browser, baseURL, permissions }, provide, testInfo) =>
    device("second-device", { browser, baseURL, permissions }, provide, testInfo),
  thirdDevice: async ({ browser, baseURL, permissions }, provide, testInfo) =>
    device("third-device", { browser, baseURL, permissions }, provide, testInfo),
});
