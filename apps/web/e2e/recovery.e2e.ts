import { expect } from "@playwright/test";
import {
  expectLoginRejected,
  loginUser,
  openAccountLogin,
  randomEmail,
  randomPassword,
  registerUser,
  simulateLogout,
  skipBiometricIfShown,
} from "./helpers/auth";
import { test } from "./helpers/devices";
import { createLogin, expectInApp, expectLogin, expectSynced, syncStatus } from "./helpers/vault";

test.describe("forgotten password → recover with recovery key", () => {
  test("resets the password, rotates the recovery key and logs in with the new one", async ({
    page,
  }) => {
    const email = randomEmail();
    const oldPassword = randomPassword();
    const newPassword = randomPassword();

    const recoveryKey = await registerUser(page, email, oldPassword);
    await simulateLogout(page);

    await page.locator('a[href="/recover"]').click();
    await expect(page).toHaveURL(/\/recover$/);

    await page.locator('input[name="email"]').fill(email);
    // A paste into the first group spreads over all four.
    await page.locator('input[name="recoveryKey-1"]').fill(recoveryKey);
    await page.locator('form button[type="submit"]').click();

    await page.locator('input[name="password"]').fill(newPassword);
    await page.locator('input[name="confirmPassword"]').fill(newPassword);
    await page.locator('form button[type="submit"]').click();

    // A new recovery key replaces the old one (Argon2id re-wrap dominates timing).
    await expect(page.getByText(/old recovery key no longer works/i)).toBeVisible({
      timeout: 30_000,
    });
    const newRecoveryKey = (await page.locator("code").first().textContent())?.trim() ?? "";
    expect(newRecoveryKey).not.toBe("");
    expect(newRecoveryKey).not.toBe(recoveryKey);
    await page.getByRole("button", { name: /copy to clipboard/i }).click();
    await page.getByRole("button", { name: /i saved it/i }).click();

    // The vault opens with the new password, no second entry.
    await page.waitForURL((url) => !url.pathname.startsWith("/recover"), { timeout: 30_000 });
    await skipBiometricIfShown(page);
    await expect(page).toHaveURL(/\/(\?.*)?$/);

    await simulateLogout(page);
    // Old password is gone.
    await expectLoginRejected(page, oldPassword, email);

    await loginUser(page, email, newPassword);
    await skipBiometricIfShown(page);
    await expect(page).toHaveURL(/\/(\?.*)?$/);
  });
});

test.describe("forgotten password, offline → reset on the device, account follows", () => {
  test("opens the vault with the new password offline and finishes the reset once online", async ({
    page,
    secondDevice,
  }) => {
    const email = randomEmail();
    const oldPassword = randomPassword();
    const newPassword = randomPassword();

    const recoveryKey = await registerUser(page, email, oldPassword);
    await skipBiometricIfShown(page);
    await expectInApp(page);

    // Locked (keys dropped), the profile stays on the device; then the network goes.
    await page.goto("/login");
    await expect(page.locator('input[name="password"]')).toBeVisible({ timeout: 15_000 });
    await page.context().setOffline(true);

    await page.getByRole("link", { name: /forgot password/i }).click();
    await page.locator('input[name="recoveryKey-1"]').fill(recoveryKey);
    await page.locator('form button[type="submit"]').click();
    await page.locator('input[name="password"]').fill(newPassword);
    await page.locator('input[name="confirmPassword"]').fill(newPassword);
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByText(/old recovery key no longer works/i)).toBeVisible({
      timeout: 30_000,
    });
    const newRecoveryKey = (await page.locator("code").first().textContent())?.trim() ?? "";
    expect(newRecoveryKey).not.toBe(recoveryKey);
    await page.getByRole("button", { name: /copy to clipboard/i }).click();
    await page.getByRole("button", { name: /i saved it/i }).click();

    await page.waitForURL((url) => !url.pathname.startsWith("/recover"), { timeout: 30_000 });
    await skipBiometricIfShown(page);
    await expectInApp(page);
    await expect(syncStatus(page)).toHaveAccessibleName("Sync status: Password reset waiting");
    const recordId = await createLogin(page, { title: "Made offline", username: "offline-user" });

    // Back online: the reset reaches the server first, then the outbox.
    await page.context().setOffline(false);
    await expectSynced(page);

    await openAccountLogin(secondDevice);
    await expectLoginRejected(secondDevice, oldPassword, email);
    await loginUser(secondDevice, email, newPassword);
    await skipBiometricIfShown(secondDevice);
    await expectInApp(secondDevice);
    await expectLogin(secondDevice, recordId, { title: "Made offline", username: "offline-user" });
  });
});
