import { expect, test } from "@playwright/test";
import { randomPassword, saveRecoveryKey, showProfiles } from "./helpers/auth";
import { createLocalVault, createLogin, expectInApp } from "./helpers/vault";

/** Restore (ADR 0001 D12) from "Switch vault": a new vault next to the one already here. */
test("restores an encrypted backup next to an existing vault", async ({ page }) => {
  test.setTimeout(120_000);
  const password = randomPassword();
  const backupPassword = randomPassword();
  await createLocalVault(page, "Source", password);
  await createLogin(page, { title: "Mail", username: "jana", password: "mail-pw" });

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Security", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Master password").fill(password);
  await dialog.getByLabel("Backup password", { exact: true }).fill(backupPassword);
  await dialog.getByLabel("Confirm backup password").fill(backupPassword);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export backup" }).click();
  const backupPath = await (await download).path();

  // A reload locks: the unlock of "Source" opens.
  await page.goto("/login");
  await showProfiles(page);
  await page.getByRole("link", { name: "Restore or import" }).click();
  await expect(page.getByText("next to the ones already here", { exact: false })).toBeVisible();

  await page.getByLabel("Backup or export file").setInputFiles(backupPath);
  await page.getByLabel("Backup password").fill("not-the-backup-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("That backup password doesn't open this file.")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("Backup password").fill(backupPassword);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("1 record(s) ready to restore")).toBeVisible({ timeout: 30_000 });

  const newPassword = randomPassword();
  await page.locator('input[name="name"]').fill("Restored");
  await page.locator('input[name="password"]').fill(newPassword);
  await page.locator('input[name="confirmPassword"]').fill(newPassword);
  await page.getByRole("button", { name: "Restore vault" }).click();
  await saveRecoveryKey(page);
  await expectInApp(page);
  await expect(page.getByRole("link", { name: /Mail jana$/ })).toBeVisible({ timeout: 15_000 });

  await page.goto("/login");
  await showProfiles(page);
  const vaults = page.getByRole("list", { name: /vaults on this device/i });
  await expect(vaults.getByRole("button", { name: /^Source/ })).toBeVisible();
  await expect(vaults.getByRole("button", { name: /^Restored/ })).toBeVisible();
});

/** Start from another password manager's export: Welcome → a new vault holding its records. */
test("starts a new vault from a Chrome password export", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/welcome");
  await page.getByRole("link", { name: "Import it" }).click();

  await page.getByLabel("Backup or export file").setInputFiles({
    name: "Chrome Passwords.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,url,username,password,note\r\n" +
        "Mail,https://mail.example.com,jana,mail-pw,\r\n" +
        "Bank,https://bank.example.com,jana@example.com,bank-pw,\r\n",
    ),
  });
  await expect(page.getByText("2 item(s) ready to import")).toBeVisible();

  const password = randomPassword();
  await page.locator('input[name="name"]').fill("From Chrome");
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.getByRole("button", { name: "Create vault & import" }).click();
  await saveRecoveryKey(page);
  await expectInApp(page);
  await expect(page.getByText("Imported 2 items from Chrome / Edge.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("link", { name: /Mail jana$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Bank jana@example\.com$/ })).toBeVisible();
});
