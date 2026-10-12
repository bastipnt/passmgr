import { expect, test } from "@playwright/test";
import { randomPassword } from "./helpers/auth";
import { createLocalVault, createLogin } from "./helpers/vault";

/**
 * Pass Monitor (Settings → Pass Monitor): weak, reused, duplicate and old
 * passwords, checked on the device after decryption.
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
