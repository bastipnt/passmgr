import { expect, type Page } from "@playwright/test";
import {
  expectLoginRejected,
  loginUser,
  openAccountLogin,
  randomEmail,
  randomPassword,
  registerUser,
} from "./helpers/auth";
import { test } from "./helpers/devices";
import {
  createLocalVault,
  createLogin,
  expectInApp,
  expectLogin,
  expectSynced,
  reloadAndUnlock,
} from "./helpers/vault";

/**
 * Changing the master password (ADR 0001 D10). An account: a new OPAQUE
 * registration and password wrap replace the server's and every session is
 * revoked; the changing device logs in again by itself, another device locks
 * (signed out) until it unlocks with the new password. A local vault: the
 * account key is rewrapped on the device. Either way the old password stops
 * working and the records stay.
 */

async function changePassword(page: Page, current: string, next: string): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Account & sync", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
  await page.getByRole("button", { name: "Change password", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="currentPassword"]').fill(current);
  await dialog.locator('input[name="password"]').fill(next);
  await dialog.locator('input[name="confirmPassword"]').fill(next);
  await dialog.getByRole("button", { name: "Change password", exact: true }).click();
  // Linked: a fresh login, a new registration, the Argon2 wrap and a login again.
  await expect(dialog).toHaveCount(0, { timeout: 60_000 });

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectInApp(page);
}

test("changing an account's password signs out other devices and keeps the records", async ({
  page,
  secondDevice,
  thirdDevice,
}) => {
  // Three devices, each with Argon2 unlocks, and two OPAQUE logins for the change.
  test.setTimeout(180_000);
  const email = randomEmail();
  const oldPassword = randomPassword();
  const newPassword = randomPassword();

  await registerUser(page, email, oldPassword);
  await loginUser(page, email, oldPassword);
  await expectInApp(page);
  const recordId = await createLogin(page, { title: "Bank", username: "before" });
  await expectSynced(page);

  const phone = secondDevice;
  await loginUser(phone, email, oldPassword);
  await expectInApp(phone);
  await expectSynced(phone);

  // The phone edits offline while the password changes elsewhere.
  await phone.context().setOffline(true);
  const phoneId = await createLogin(phone, { title: "Phone", username: "offline" });

  await changePassword(page, oldPassword, newPassword);

  // This device is back online with the new password and still syncs.
  await expectSynced(page);
  const afterId = await createLogin(page, { title: "Mail", username: "after" });
  await expectSynced(page);

  // The phone's session was revoked: back online, its next sync is turned down
  // as signed out and it locks (a reload), keeping the unsent record.
  await phone.context().setOffline(false);
  await expect(phone.getByText(/you were signed out from another device/i)).toBeVisible({
    timeout: 30_000,
  });

  // Unlocking it with the new password goes through the server (its stored
  // wrap is the old one), takes the new wrap and pushes what waited.
  await reloadAndUnlock(phone, newPassword);
  await expectSynced(phone);
  await expectLogin(phone, afterId, { title: "Mail", username: "after" });
  await expectLogin(page, phoneId, { title: "Phone", username: "offline" });

  // A device that never held the vault: the old password fails, the new one opens every record.
  const fresh = thirdDevice;
  await openAccountLogin(fresh);
  await expectLoginRejected(fresh, oldPassword, email);
  await loginUser(fresh, email, newPassword);
  await expectInApp(fresh);
  await expectSynced(fresh);
  await expectLogin(fresh, recordId, { title: "Bank", username: "before" });
  await expectLogin(fresh, afterId, { title: "Mail", username: "after" });
  await expectLogin(fresh, phoneId, { title: "Phone", username: "offline" });
});

test("changing a local vault's password rewraps it on the device", async ({ page }) => {
  const oldPassword = randomPassword();
  const newPassword = randomPassword();

  await createLocalVault(page, "Travel", oldPassword);
  const recordId = await createLogin(page, { title: "Hotel", username: "guest" });

  await changePassword(page, oldPassword, newPassword);

  // A reload drops every key: the unlock card takes only the new password.
  await page.goto("/login");
  await expectLoginRejected(page, oldPassword);
  await reloadAndUnlock(page, newPassword);
  await expectLogin(page, recordId, { title: "Hotel", username: "guest" });
});
