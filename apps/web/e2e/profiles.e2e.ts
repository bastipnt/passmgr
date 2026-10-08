import { expect, type Page, test } from "@playwright/test";
import {
  loginUser,
  randomEmail,
  randomPassword,
  registerUser,
  showEmailLogin,
  skipBiometricIfShown,
} from "./helpers/auth";

/**
 * Several profiles on one browser profile (ADR 0001 D2): two accounts and a
 * vault without one live side by side, each in its own database. Web keys
 * live in memory only, so a reload locks.
 */

async function inApp(page: Page) {
  await skipBiometricIfShown(page);
  await expect(page).toHaveURL(/\/(\?.*)?$/, { timeout: 30_000 });
}

async function lockByReload(page: Page) {
  await page.goto("/login");
  await expect(page.locator("form")).toBeVisible({ timeout: 15_000 });
}

/** The profile whose unlock card is open. */
function unlockCard(page: Page, label: string) {
  return page.locator("form").getByText(label, { exact: true });
}

function profileList(page: Page) {
  return page.getByRole("list", { name: /vaults on this device/i });
}

async function unlockWithPassword(page: Page, password: string) {
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await inApp(page);
}

test.describe("multiple profiles per device", () => {
  test("two accounts and a local vault, picked, signed into and removed", async ({ page }) => {
    const alice = { email: randomEmail(), password: randomPassword() };
    const bob = { email: randomEmail(), password: randomPassword() };
    const localPassword = randomPassword();

    // Two accounts: each login adds a profile, the other one stays.
    await registerUser(page, alice.email, alice.password);
    await loginUser(page, alice.email, alice.password);
    await inApp(page);

    await registerUser(page, bob.email, bob.password);
    await loginUser(page, bob.email, bob.password);
    await inApp(page);

    // The last used profile opens as an unlock card.
    await lockByReload(page);
    await expect(unlockCard(page, bob.email)).toBeVisible();

    // A vault without an account, next to the two.
    await showEmailLogin(page);
    await page.locator('a[href="/local-vault"]').first().click();
    await page.locator('input[name="name"]').fill("Travel");
    await page.locator('input[name="password"]').fill(localPassword);
    await page.locator('input[name="confirmPassword"]').fill(localPassword);
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText(/save your recovery key/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /copy to clipboard/i }).click();
    await page.getByRole("button", { name: /i saved it/i }).click();
    await inApp(page);

    await lockByReload(page);
    await expect(unlockCard(page, "Travel")).toBeVisible();
    await showEmailLogin(page);
    await expect(profileList(page).getByRole("button")).toHaveCount(3);

    // Picking a profile unlocks it with the password alone.
    await profileList(page)
      .getByRole("button", { name: new RegExp(alice.email) })
      .click();
    await expect(unlockCard(page, alice.email)).toBeVisible();
    await unlockWithPassword(page, alice.password);

    // Signing in with the email of a profile on the device opens that profile:
    // no new one is added.
    await lockByReload(page);
    await loginUser(page, bob.email, bob.password);
    await inApp(page);
    await lockByReload(page);
    await expect(unlockCard(page, bob.email)).toBeVisible();
    await showEmailLogin(page);
    await expect(profileList(page).getByRole("button")).toHaveCount(3);

    // Remove all: back to a device without profiles.
    await page.getByRole("button", { name: /remove all vaults from this device/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/only copy/i)).toBeVisible();
    await dialog.getByRole("button", { name: /^remove all$/i }).click();
    await expect(profileList(page)).toHaveCount(0);

    await lockByReload(page);
    await expect(page.getByRole("button", { name: /^switch$/i })).toHaveCount(0);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
