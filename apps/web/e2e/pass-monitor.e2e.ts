import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { randomPassword } from "./helpers/auth";
import { createLocalVault, createLogin } from "./helpers/vault";

/**
 * Pass Monitor (Settings → Pass Monitor): weak, reused, duplicate and old
 * passwords, checked on the device after decryption; breached ones against a
 * stubbed HIBP range API.
 */
test("finds a weak password reused by two logins and opens one of them", async ({ page }) => {
  test.setTimeout(90_000);
  await createLocalVault(page, "Monitor", randomPassword());

  const github = await createLogin(page, {
    title: "GitHub",
    username: "jana",
    password: "password1",
  });
  await createLogin(page, { title: "Figma", username: "jana", password: "password1" });

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: /Pass Monitor/ }).click();

  await expect(page.getByLabel("2 Weak passwords")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("2 Reused passwords")).toBeVisible();
  await expect(page.getByLabel("0 Duplicates")).toBeVisible();
  await expect(page.getByLabel("0 Old passwords")).toBeVisible();

  await page.getByRole("link", { name: /Reused passwords/ }).click();
  await expect(page.getByRole("heading", { name: "Used in 2 places" })).toBeVisible();
  await expect(page.getByText("password1")).toHaveCount(0);

  await page.getByRole("link", { name: /GitHub/ }).click();
  await expect(page).toHaveURL(new RegExp(`/record/${github}$`));
});

test("checks passwords against HIBP only by hash prefix, once turned on", async ({ page }) => {
  test.setTimeout(90_000);
  const hash = createHash("sha1").update("password1").digest("hex").toUpperCase();
  const requests: { url: string; padding: string | undefined }[] = [];
  await page.route("https://api.pwnedpasswords.com/range/*", async (route) => {
    const request = route.request();
    requests.push({ url: request.url(), padding: request.headers()["add-padding"] });
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain" },
      body: `${hash.slice(5)}:2254650\r\n0000000000000000000000000000000000A:0\r\n`,
    });
  });

  await createLocalVault(page, "Breaches", randomPassword());
  const github = await createLogin(page, {
    title: "GitHub",
    username: "jana",
    password: "password1",
  });
  await createLogin(page, { title: "Figma", username: "jana", password: randomPassword() });

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: /Pass Monitor/ }).click();
  await expect(page.getByRole("link", { name: /Breached passwords/ })).toContainText("Off");
  expect(requests).toEqual([]);

  await page.getByRole("link", { name: /Breached passwords/ }).click();
  await page.getByRole("button", { name: "Turn on breach check" }).click();

  const breached = page.getByRole("link", { name: /GitHub/ });
  await expect(breached).toContainText("Seen 2,254,650 times in data breaches");
  await expect(page.getByRole("link", { name: /Figma/ })).toHaveCount(0);
  expect(requests).toHaveLength(2);
  for (const { url, padding } of requests) {
    expect(url).toMatch(/\/range\/[0-9A-F]{5}$/);
    expect(url).not.toContain(hash.slice(5));
    expect(padding).toBe("true");
  }

  await breached.click();
  await expect(page).toHaveURL(new RegExp(`/record/${github}$`));
  await expect(page.getByText("Seen 2,254,650 times in data breaches")).toBeVisible();
});
