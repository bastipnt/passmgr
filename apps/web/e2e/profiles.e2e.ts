import { expect, type Page, test } from "@playwright/test";
import {
  loginUser,
  randomEmail,
  randomPassword,
  registerUser,
  saveRecoveryKey,
  showProfiles,
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
  return page.locator('[data-slot="card"]').getByText(label, { exact: true });
}

function profileList(page: Page) {
  return page.getByRole("list", { name: /vaults on this device/i });
}

/** A profile's row in "Switch vault"; its remove button's name starts with "Remove". */
function profileButton(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return profileList(page).getByRole("button", { name: new RegExp(`^${escaped}`) });
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

    // Two accounts: each sign-up adds a profile, the other one stays.
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
    await showProfiles(page);
    await page.locator('a[href="/create"]').first().click();
    await page.locator('input[name="name"]').fill("Travel");
    await page.locator('input[name="password"]').fill(localPassword);
    await page.locator('input[name="confirmPassword"]').fill(localPassword);
    await page.locator('form button[type="submit"]').click();
    await page.getByRole("button", { name: /not now/i }).click();
    await saveRecoveryKey(page);
    await inApp(page);

    await lockByReload(page);
    await expect(unlockCard(page, "Travel")).toBeVisible();
    await showProfiles(page);
    await expect(profileList(page).getByRole("listitem")).toHaveCount(3);

    // Picking a profile unlocks it with the password alone.
    await profileButton(page, alice.email).click();
    await expect(unlockCard(page, alice.email)).toBeVisible();
    await unlockWithPassword(page, alice.password);

    // Signing in with the email of a profile on the device opens that profile:
    // no new one is added.
    await lockByReload(page);
    await loginUser(page, bob.email, bob.password);
    await inApp(page);
    await lockByReload(page);
    await expect(unlockCard(page, bob.email)).toBeVisible();
    await showProfiles(page);
    await expect(profileList(page).getByRole("listitem")).toHaveCount(3);

    // Remove one from the sheet: the others stay, the next one opens.
    await profileList(page)
      .getByRole("button", { name: `Remove ${bob.email} from this device` })
      .click();
    const removeOne = page.getByRole("dialog", { name: /^remove vault$/i });
    await expect(removeOne.getByText(/server are not affected/i)).toBeVisible();
    await removeOne.getByRole("button", { name: /^remove vault$/i }).click();
    await expect(profileList(page).getByRole("listitem")).toHaveCount(2);
    await expect(profileButton(page, bob.email)).toHaveCount(0);

    // Remove all: back to a device without profiles.
    await page.getByRole("button", { name: /remove all vaults from this device/i }).click();
    const dialog = page.getByRole("dialog", { name: /remove all vaults/i });
    await expect(dialog.getByText(/only copy/i)).toBeVisible();
    await dialog.getByRole("button", { name: /^remove all$/i }).click();
    await expect(profileList(page)).toHaveCount(0);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/welcome$/);
  });
});
