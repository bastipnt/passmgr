import { expect, type Page } from "@playwright/test";
import { loginUser, randomEmail, randomPassword, registerUser } from "./helpers/auth";
import { test } from "./helpers/devices";
import {
  createLogin,
  editLogin,
  expectInApp,
  expectInHistory,
  expectLogin,
  expectSynced,
  syncStatus,
} from "./helpers/vault";

/**
 * Vault-key rotation (ADR 0001 D7): one device rotates the personal vault's
 * key while another edits offline under the old one. The records move to the
 * new key, the offline edit is re-encrypted once the device learns of it, and
 * the history from before stays readable on both.
 */

async function rotatePersonalVaultKey(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Vaults" }).click();
  await expect(page).toHaveURL(/\/settings\/vaults$/);
  await page.getByRole("button", { name: "Rotate the key of Personal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Rotate key" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectInApp(page);
}

test("rotating a vault key re-encrypts its records, an offline edit included", async ({
  page,
  secondDevice,
}) => {
  const email = randomEmail();
  const password = randomPassword();

  await registerUser(page, email, password);
  await loginUser(page, email, password);
  await expectInApp(page);
  const recordId = await createLogin(page, { title: "Bank", username: "first" });
  await editLogin(page, recordId, { username: "second" });
  await expectSynced(page);

  const phone = secondDevice;
  await loginUser(phone, email, password);
  await expectInApp(phone);
  await expectSynced(phone);
  await phone.context().setOffline(true);
  await expect(syncStatus(phone)).toHaveAccessibleName("Sync status: Offline");
  await editLogin(phone, recordId, { username: "from-phone" }); // under the old key

  await rotatePersonalVaultKey(page);
  await expectSynced(page);
  await expectLogin(page, recordId, { title: "Bank", username: "second" });

  // The phone's push is turned down (old key); the pull brings the new one and it goes again.
  await phone.context().setOffline(false);
  await expectSynced(phone);
  await expectLogin(phone, recordId, { title: "Bank", username: "from-phone" });
  await expectLogin(page, recordId, { title: "Bank", username: "from-phone" });

  // Versions from before the rotation open with the old key, kept under the new one.
  await expectInHistory(page, recordId, "first");
  await expectInHistory(phone, recordId, "first");
});
