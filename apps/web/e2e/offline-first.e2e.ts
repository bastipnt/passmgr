import { test as base, expect, type Page } from "@playwright/test";
import { loginUser, randomEmail, randomPassword, registerUser } from "./helpers/auth";
import {
  createLocalVault,
  createLogin,
  editLogin,
  expectInApp,
  expectInHistory,
  expectLogin,
  expectSynced,
  reloadAndUnlock,
  syncStatus,
} from "./helpers/vault";

/**
 * Offline-first (ADR 0001): a vault that starts on one device, becomes an
 * account, syncs to a second device, and converges after concurrent edits;
 * a linked device keeps writing while offline and catches up.
 */

/**
 * A second device: its own browser context, so its own OPFS and memory. A
 * fixture, so it closes even when the test fails, with a screenshot attached
 * (the config's `screenshot` covers only the default page).
 */
const test = base.extend<{ secondDevice: Page }>({
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

async function openAccountSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
}

async function backToVault(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectInApp(page);
}

test.describe("offline-first", () => {
  test("local vault → reload → online account → second device → concurrent edits merge", async ({
    page,
    secondDevice,
  }) => {
    const email = randomEmail();
    const password = randomPassword();

    // A vault without an account; its records survive a reload (OPFS).
    await createLocalVault(page, "Laptop", password);
    await expect(syncStatus(page)).toHaveAccessibleName("Sync status: On this device only");
    const recordId = await createLogin(page, {
      title: "Mail",
      username: "first-user",
      note: "first note",
    });

    await reloadAndUnlock(page, password);
    await expectLogin(page, recordId, { title: "Mail", username: "first-user" });

    // Same master password, same keys: the account takes the vault as it is.
    await openAccountSettings(page);
    await page.getByRole("button", { name: "Create online account" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="email"]').fill(email);
    await dialog.locator('input[name="password"]').fill(password);
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/changes sync with your account/i)).toBeVisible();
    await backToVault(page);
    await expectSynced(page);

    // A second device signs in and pulls the record.
    const phone = secondDevice;
    await loginUser(phone, email, password);
    await expectInApp(phone);
    await expectSynced(phone);
    await expectLogin(phone, recordId, {
      title: "Mail",
      username: "first-user",
      note: "first note",
    });

    // Concurrent edits: the phone edits offline first, the laptop edits the
    // same record later while online. Field by field (ADR 0001 D5): the later
    // edit wins a field changed on both sides, a field changed on one side
    // keeps that change.
    await phone.context().setOffline(true);
    await expect(syncStatus(phone)).toHaveAccessibleName("Sync status: Offline");
    await editLogin(phone, recordId, { username: "phone-user", note: "phone note" });
    await expect(syncStatus(phone)).toHaveAccessibleName("Sync status: Offline");

    await editLogin(page, recordId, { username: "laptop-user" });
    await expectSynced(page);

    await phone.context().setOffline(false);
    await expectSynced(phone);

    const merged = { title: "Mail", username: "laptop-user", note: "phone note" };
    await expectLogin(phone, recordId, merged);
    // The laptop hears of the phone's push over SSE.
    await expectLogin(page, recordId, merged);
    // The phone's own edit stays in the history, below the merged version.
    await expectInHistory(phone, recordId, "phone-user");
  });

  test("a linked device edits offline and syncs once back online", async ({
    page,
    secondDevice,
  }) => {
    const email = randomEmail();
    const password = randomPassword();

    await registerUser(page, email, password);
    await loginUser(page, email, password);
    await expectInApp(page);
    await expectSynced(page);
    const existingId = await createLogin(page, { title: "Bank", username: "before" });
    await expectSynced(page);

    // Offline is a state, not an error: writes land in the outbox.
    await page.context().setOffline(true);
    await expect(syncStatus(page)).toHaveAccessibleName("Sync status: Offline");
    const offlineId = await createLogin(page, { title: "Shop", username: "made-offline" });
    await editLogin(page, existingId, { username: "edited-offline" });
    await syncStatus(page).click();
    await expect(page.getByRole("menu").getByText(/changes? saved on this device/i)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.context().setOffline(false);
    await expectSynced(page);

    const other = secondDevice;
    await loginUser(other, email, password);
    await expectInApp(other);
    await expectLogin(other, offlineId, { title: "Shop", username: "made-offline" });
    await expectLogin(other, existingId, { title: "Bank", username: "edited-offline" });
  });
});
