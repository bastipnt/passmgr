import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { randomPassword } from "./helpers/auth";
import { createLocalVault, expectInApp } from "./helpers/vault";

/** Import from another password manager (Settings → Security → Import): a Chrome CSV. */
test("imports a Chrome password export into the vault", async ({ page }) => {
  test.setTimeout(90_000);
  await createLocalVault(page, "Import", randomPassword());

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Security", exact: true }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await page.getByLabel("Export file").setInputFiles({
    name: "Chrome Passwords.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,url,username,password,note\r\n" +
        "Mail,https://mail.example.com,jana,mail-pw,\r\n" +
        "Bank,https://bank.example.com,jana@example.com,bank-pw,\r\n",
    ),
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Chrome / Edge export: 2 logins.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog.getByText("Imported 2 items from Chrome / Edge.")).toBeVisible();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectInApp(page);
  await expect(page.getByRole("link", { name: /Mail jana$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Bank jana@example\.com$/ })).toBeVisible();
});

const kdbxFixture = (name: string) =>
  join(import.meta.dirname, "../../../packages/crypto/test/fixtures/kdbx", name);

/** A KeePass database (KDBX 4, Argon2d in the worker) with password and key file. */
test("imports a KeePass database with its password and key file", async ({ page }) => {
  test.setTimeout(90_000);
  await createLocalVault(page, "KeePass", randomPassword());

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Security", exact: true }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await page.getByLabel("Export file").setInputFiles(kdbxFixture("kdbxweb-Argon2.kdbx"));
  await page.getByLabel("Key file").setInputFiles(kdbxFixture("kdbxweb-demo.key"));
  await dialog.getByLabel("Database password").fill("wrong");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByText("That password or key file doesn't open")).toBeVisible();

  await dialog.getByLabel("Database password").fill("demo");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(dialog.getByText("KeePass database:", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog.getByText(/Imported \d+ items from KeePass/)).toBeVisible();
  await expect(dialog.getByText("Delete it now", { exact: false })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectInApp(page);
  await expect(page.getByRole("link", { name: /Sample Entry User Name$/ })).toBeVisible();
});
