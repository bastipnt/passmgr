import { expect, type Locator, type Page } from "@playwright/test";
import { saveRecoveryKey, skipBiometricIfShown, startCreateVault } from "./auth";

/**
 * Helpers for the vault UI. Web keys live in memory only, so everything after
 * an unlock navigates inside the app (clicks), never with `page.goto`: a full
 * load locks the vault.
 */

export type LoginFields = {
  title?: string;
  username?: string;
  email?: string;
  password?: string;
  note?: string;
  /** Added as a new website, after any the login has. */
  website?: string;
  /** Added after any the login has. */
  tags?: string[];
};

/** Resolves once the vault is open on the record list (or a record); phones name the button "New item". */
export async function expectInApp(page: Page): Promise<void> {
  await skipBiometricIfShown(page);
  await expect(page.getByRole("button", { name: /^New (record|item)$/ })).toBeVisible({
    timeout: 30_000,
  });
}

/** A vault on this device only (ADR 0001 D2), from a browser without one open. */
export async function createLocalVault(page: Page, name: string, password: string): Promise<void> {
  await startCreateVault(page, password, { name });
  await page.getByRole("button", { name: /not now/i }).click();
  await saveRecoveryKey(page);
  await expectInApp(page);
}

/**
 * Reload (drops every key) and submit the last used profile's password,
 * without waiting for the vault: a dialog right after the unlock (the
 * two-factor prompt) hides the app from the accessibility tree.
 */
export async function reloadAndSubmitUnlock(page: Page, password: string): Promise<void> {
  await page.goto("/login");
  await expect(page.locator('input[name="password"]')).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
}

/** Reload (drops every key), then unlock the last used profile with its password. */
export async function reloadAndUnlock(page: Page, password: string): Promise<void> {
  await reloadAndSubmitUnlock(page, password);
  await expectInApp(page);
}

/** Form values by input name (`title`, `number`, `customFields.0.value`, …). */
export type RecordFields = Record<string, string | undefined>;

/** The open create / edit sheet (a drawer on phones). */
export function recordSheet(page: Page): Locator {
  return page.getByRole("dialog");
}

export async function fillRecordForm(page: Page, fields: RecordFields): Promise<void> {
  const sheet = recordSheet(page);
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    await sheet.locator(`[name="${name}"]`).fill(value);
  }
}

async function fillLoginForm(page: Page, fields: LoginFields): Promise<void> {
  const sheet = recordSheet(page);
  const { website, tags = [], ...inputs } = fields;
  await fillRecordForm(page, inputs);
  if (website !== undefined) {
    await sheet.getByRole("button", { name: "Add website" }).click();
    await sheet.locator('[name^="websites."][name$=".value"]').last().fill(website);
  }
  const tagInput = sheet.getByRole("combobox", { name: "Tags" });
  for (const tag of tags) {
    await tagInput.fill(tag);
    await tagInput.press("Enter");
    await expect(sheet.getByRole("button", { name: `Remove ${tag}`, exact: true })).toBeVisible();
  }
}

/** Open the create sheet on `type` (the picker's label, e.g. "Credit card"). */
export async function openCreateForm(page: Page, type: string): Promise<void> {
  await page.getByRole("button", { name: /^New (record|item)$/ }).click();
  // The create sheet opens on the type picker.
  await recordSheet(page).getByRole("link", { name: type, exact: true }).click();
}

/** Submit the create sheet; resolves the new record's id once it is open. */
export async function submitCreateForm(page: Page): Promise<string> {
  await recordSheet(page)
    .getByRole("button", { name: /^Create( [\w -]+)?$/ })
    .click();
  await page.waitForURL(/\/record\/[^/?]+$/);
  const recordId = new URL(page.url()).pathname.split("/").at(-1);
  if (!recordId) throw new Error(`no record id in ${page.url()}`);
  return recordId;
}

/** Create a record of `type` through the create sheet; returns its record id. */
export async function createRecord(
  page: Page,
  type: string,
  fields: RecordFields,
): Promise<string> {
  await openCreateForm(page, type);
  await fillRecordForm(page, fields);
  return submitCreateForm(page);
}

/** Create a login record through the create sheet; returns its record id. */
export async function createLogin(page: Page, fields: LoginFields): Promise<string> {
  await openCreateForm(page, "Login");
  await fillLoginForm(page, fields);
  return submitCreateForm(page);
}

/** The record ids the list shows, in its order. */
export async function listedRecordIds(page: Page): Promise<string[]> {
  const hrefs = await page
    .locator('a[href^="/record/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return hrefs.flatMap((href) => /^\/record\/([^/?]+)$/.exec(href)?.[1] ?? []);
}

/** Desktop: the list panel's search field (a combobox; its results replace the list while it has focus). */
export function searchField(page: Page) {
  return page.getByRole("combobox", { name: /^Search / });
}

/** The search panel's records (`"Search results"`) or, in `#` tag mode, its tags (`"Tags"`). */
export function searchOptions(page: Page, listbox: "Search results" | "Tags" = "Search results") {
  return page.getByRole("listbox", { name: listbox }).getByRole("option");
}

/** Expand the record detail's password issues (under the password); resolves their list. */
export async function openPasswordIssues(page: Page) {
  await page.getByRole("button", { name: /^\d+ issues?$/, expanded: false }).click();
  return page.getByRole("list", { name: "Password issues" });
}

/** Desktop: Lock vault at the sidebar's foot (an icon in the collapsed rail); waits for the unlock screen. */
export async function lockFromSidebar(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.locator('input[name="password"]')).toBeVisible({ timeout: 15_000 });
}

/** Wait until the list shows exactly these records (in this order, if `ordered`). */
export async function expectListed(
  page: Page,
  ids: string[],
  { ordered = false } = {},
): Promise<void> {
  await expect
    .poll(async () => {
      const listed = await listedRecordIds(page);
      return ordered ? listed : listed.sort();
    })
    .toEqual(ordered ? ids : [...ids].sort());
}

export async function openRecord(page: Page, recordId: string): Promise<void> {
  await page.locator(`a[href="/record/${recordId}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/record/${recordId}$`));
}

/** Open the record's edit sheet. */
export async function openEditForm(page: Page, recordId: string): Promise<void> {
  await openRecord(page, recordId);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
}

/** Save the edit sheet; resolves once it closed. */
export async function submitEditForm(page: Page): Promise<void> {
  await recordSheet(page)
    .getByRole("button", { name: /^Save( changes)?$/ })
    .click();
  await expect(recordSheet(page)).toHaveCount(0);
}

/** Change fields of a record through the edit sheet. */
export async function editRecord(
  page: Page,
  recordId: string,
  fields: RecordFields,
): Promise<void> {
  await openEditForm(page, recordId);
  await fillRecordForm(page, fields);
  await submitEditForm(page);
}

/** Change fields of a login record through the edit sheet. */
export async function editLogin(page: Page, recordId: string, fields: LoginFields): Promise<void> {
  await openEditForm(page, recordId);
  await fillLoginForm(page, fields);
  await submitEditForm(page);
}

/**
 * Wait until the record's form values read as expected, reopening it on each try:
 * the edit form snapshots the record when it opens, so a sync that lands
 * later only shows on the next open.
 */
export async function expectRecord(
  page: Page,
  recordId: string,
  fields: RecordFields,
  timeout = 30_000,
): Promise<void> {
  await expect(async () => {
    await openEditForm(page, recordId);
    const sheet = recordSheet(page);
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

export async function expectLogin(
  page: Page,
  recordId: string,
  fields: Omit<LoginFields, "tags" | "website">,
  timeout = 30_000,
): Promise<void> {
  await expectRecord(page, recordId, fields, timeout);
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

/**
 * The sync indicator (ADR 0001 D8): the sidebar card on desktop (the rail's account icon when
 * collapsed), the page-bar button on phones.
 */
export function syncStatus(page: Page) {
  return page.getByRole("button", { name: /^(Account & sync, )?sync status:/i });
}

export async function expectSyncStatus(page: Page, title: string, timeout?: number) {
  await expect(syncStatus(page)).toHaveAccessibleName(new RegExp(`sync status: ${title}$`, "i"), {
    timeout,
  });
}

export async function expectSynced(page: Page, timeout = 30_000): Promise<void> {
  await expectSyncStatus(page, "Synced", timeout);
}
