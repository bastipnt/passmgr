import { expect, test } from "@playwright/test";
import { loginUser, randomEmail, randomPassword, registerUser } from "./helpers/auth";

/**
 * Capture every outbound request during a full register + login flow and
 * assert that neither the plaintext password nor the recovery key appears
 * anywhere in the URL or request body. This is the Layer 4 mirror of the
 * server-side `no-secret-leak.int.test.ts` — same property, observed from
 * the browser.
 */
test("no plaintext password or recoveryKey ever leaves the browser", async ({ page }) => {
  const email = randomEmail();
  const password = randomPassword();

  const captured: Array<{ url: string; body: string }> = [];

  page.on("request", (req) => {
    const url = req.url();
    if (!url.includes("/trpc/")) return;
    captured.push({ url, body: req.postData() ?? "" });
  });

  const recoveryKey = await registerUser(page, email, password);
  await page.waitForURL(/\/login/);
  await loginUser(page, email, password);

  expect(captured.length).toBeGreaterThan(0);

  for (const { url, body } of captured) {
    const haystack = `${url}\n${body}`;
    expect(
      haystack,
      `password leaked into outbound request:\n${haystack.slice(0, 500)}`,
    ).not.toContain(password);
    expect(
      haystack,
      `recoveryKey leaked into outbound request:\n${haystack.slice(0, 500)}`,
    ).not.toContain(recoveryKey);
  }
});
