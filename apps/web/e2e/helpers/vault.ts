import { expect, type Page } from "@playwright/test";
import { skipBiometricIfShown } from "./auth";

/**
 * Helpers for the vault UI. Web keys live in memory only, so everything after
 * an unlock navigates inside the app (clicks), never with `page.goto`: a full
 * load locks the vault.
 */

export type LoginFields = {
  title?: string;
  username?: string;
  password?: string;
  note?: string;
};

/** Resolves once the vault is open on the record list (or a record). */
export async function expectInApp(page: Page): Promise<void> {
  await skipBiometricIfShown(page);
  await expect(page.getByRole("button", { name: "New record", exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

/** A vault on this device only (ADR 0001 D2), from a browser without one open. */
export async function createLocalVault(page: Page, name: string, password: string): Promise<void> {
  await page.goto("/local-vault");
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText(/save your recovery key/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /copy to clipboard/i }).click();
  await page.getByRole("button", { name: /i saved it/i }).click();
  await expectInApp(page);
}

/** Reload (drops every key), then unlock the last used profile with its password. */
export async function reloadAndUnlock(page: Page, password: string): Promise<void> {
  await page.goto("/login");
  await expect(page.locator('input[name="password"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expectInApp(page);
}

async function fillLoginForm(page: Page, fields: LoginFields): Promise<void> {
  const sheet = page.getByRole("dialog");
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const input = sheet.locator(`[name="${name}"]`);
    await input.fill(value);
  }
}

/** Create a login record through the create sheet; returns its record id. */
export async function createLogin(page: Page, fields: LoginFields): Promise<string> {
  await page.getByRole("button", { name: "New record", exact: true }).click();
  await fillLoginForm(page, fields);
  await page.getByRole("dialog").getByRole("button", { name: "Create login" }).click();
  await page.waitForURL(/\/record\/[^/?]+$/);
  const recordId = new URL(page.url()).pathname.split("/").at(-1);
  if (!recordId) throw new Error(`no record id in ${page.url()}`);
  return recordId;
}

async function openRecord(page: Page, recordId: string): Promise<void> {
  await page.locator(`a[href="/record/${recordId}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/record/${recordId}$`));
}

/** Change fields of a login record through the edit sheet. */
export async function editLogin(page: Page, recordId: string, fields: LoginFields): Promise<void> {
  await openRecord(page, recordId);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await fillLoginForm(page, fields);
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/**
 * Wait until the record's fields read as expected, reopening it on each try:
 * the edit form snapshots the record when it opens, so a sync that lands
 * later only shows on the next open.
 */
export async function expectLogin(
  page: Page,
  recordId: string,
  fields: LoginFields,
  timeout = 30_000,
): Promise<void> {
  await expect(async () => {
    await openRecord(page, recordId);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const sheet = page.getByRole("dialog");
    try {
      for (const [name, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        await expect(sheet.locator(`[name="${name}"]`)).toHaveValue(value, { timeout: 1_000 });
      }
    } finally {
      // Bounded: a sheet that never rendered fails this try instead of hanging `toPass`.
      await sheet.getByRole("button", { name: "Cancel" }).click({ timeout: 5_000 });
      await expect(sheet).toHaveCount(0);
    }
  }).toPass({ timeout });
}

/**
 * Wait until some earlier version of the record shows `text` (a version's
 * detail lists its fields). Back steps are in-app history, no reload.
 */
export async function expectInHistory(
  page: Page,
  recordId: string,
  text: string,
  timeout = 30_000,
): Promise<void> {
  await expect(async () => {
    await openRecord(page, recordId);
    await page.getByRole("link", { name: /version history/i }).click();
    const versionLinks = page.locator(`a[href^="/record/${recordId}/versions/"]`);
    await expect(versionLinks.first()).toBeVisible({ timeout: 5_000 });
    const hrefs = await versionLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
    let found = false;
    for (const href of hrefs) {
      await page.locator(`a[href="${href}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${href}$`));
      found = await page
        .getByRole("dialog")
        .getByText(text, { exact: true })
        .first()
        .waitFor({ timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      await page.goBack();
      if (found) break;
    }
    expect(found, `no version of ${recordId} shows "${text}"`).toBe(true);
  }).toPass({ timeout });
}

/** The header sync indicator (ADR 0001 D8). */
export function syncStatus(page: Page) {
  return page.getByRole("button", { name: /^Sync status:/ });
}

export async function expectSynced(page: Page, timeout = 30_000): Promise<void> {
  await expect(syncStatus(page)).toHaveAccessibleName("Sync status: Synced", { timeout });
}
