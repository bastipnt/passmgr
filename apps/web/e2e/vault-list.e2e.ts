import { expect, type Page, test } from "@playwright/test";
import { randomPassword } from "./helpers/auth";
import { createLocalVault, createLogin, listedRecordIds } from "./helpers/vault";

type Seeded = { alpha: string; beta: string; gamma: string };

const PHONE = { width: 390, height: 844 };

async function expectListed(page: Page, ids: string[], { ordered = false } = {}) {
  await expect
    .poll(async () => {
      const listed = await listedRecordIds(page);
      return ordered ? listed : listed.sort();
    })
    .toEqual(ordered ? ids : [...ids].sort());
}

/**
 * Alpha (work, finance) and Beta (favorite; work) in the personal vault,
 * Gamma (work) in a "Work" vault created from the vault switcher, which
 * then shows it.
 */
async function seed(page: Page): Promise<Seeded> {
  await createLocalVault(page, "Lists", randomPassword());
  const alpha = await createLogin(page, { title: "Alpha", tags: ["work", "finance"] });
  const beta = await createLogin(page, { title: "Beta", tags: ["work"] });
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove from favorites" })).toBeVisible();

  await page.getByRole("button", { name: /^Vault: / }).click();
  await page.getByRole("menuitem", { name: /New vault/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Work");
  await dialog.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByRole("button", { name: "Vault: Work" })).toBeVisible();
  const gamma = await createLogin(page, { title: "Gamma", tags: ["work"] });
  return { alpha, beta, gamma };
}

test("desktop: vault switcher, category, search, sort, collapsed sidebar", async ({ page }) => {
  const { alpha, beta, gamma } = await seed(page);
  await expectListed(page, [gamma]);

  const pickVault = async (name: RegExp) => {
    await page.getByRole("button", { name: /^Vault: / }).click();
    await page.getByRole("menuitemradio", { name }).click();
  };
  await pickVault(/^Personal/);
  await expectListed(page, [alpha, beta]);
  await pickVault(/^All vaults/);
  await expectListed(page, [alpha, beta, gamma]);

  const sidebar = page.getByRole("navigation", { name: "Categories" });
  await sidebar.getByRole("button", { name: "Favorites (1)" }).click();
  await expect(sidebar.getByRole("button", { name: "Favorites (1)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectListed(page, [beta]);
  await sidebar.getByRole("button", { name: /^All items/ }).click();
  await expectListed(page, [alpha, beta, gamma]);

  await page.getByRole("textbox", { name: "Search all vaults" }).fill("Alpha");
  await expectListed(page, [alpha]);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expectListed(page, [alpha, beta, gamma]);

  const sortBy = async (label: string) => {
    await page.getByRole("button", { name: /^Sort: / }).click();
    await page.getByRole("menuitemradio", { name: label }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Sort: ${label}` })).toBeVisible();
  };
  // Favorites stay on top in every sort.
  await sortBy("Alphabetical");
  await expectListed(page, [beta, alpha, gamma], { ordered: true });
  await sortBy("Newest to oldest");
  await expectListed(page, [beta, gamma, alpha], { ordered: true });

  const toggle = page.getByRole("button", { name: "Sidebar" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await sidebar.getByRole("button", { name: "Favorites (1)" }).click();
  await expectListed(page, [beta]);
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Account & sync, sync status: / })).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.locator('input[name="password"]')).toBeVisible({ timeout: 15_000 });
});

test("phone: filter sheet, vault sheet, account sheet → Lock", async ({ page }) => {
  const { alpha, beta, gamma } = await seed(page);
  await page.setViewportSize(PHONE);
  // A record is its own page on phones; back to the list.
  await page.getByRole("button", { name: "Back" }).click();
  await expectListed(page, [gamma]);

  await page.getByRole("button", { name: "Vault: Work" }).click();
  const vaults = page.getByRole("dialog");
  await vaults.getByRole("button", { name: /^All vaults/ }).click();
  await expect(vaults).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vault: All vaults" })).toBeVisible();
  await expectListed(page, [alpha, beta, gamma]);

  await page.getByRole("button", { name: "Filter", exact: true }).click();
  const filters = page.getByRole("dialog");
  await filters.getByRole("button", { name: "Favorites (1)" }).click();
  await filters.getByRole("button", { name: "work (1)" }).click();
  await filters.getByRole("button", { name: "Show 1 favorite" }).click();
  await expect(filters).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filter (2 on)" })).toBeVisible();
  await expectListed(page, [beta]);

  const chips = page.getByRole("list", { name: "Active filters" });
  await chips.getByRole("button", { name: "Remove filter Favorites" }).click();
  await expectListed(page, [alpha, beta, gamma]);
  await chips.getByRole("button", { name: "Remove tag work" }).click();
  await expect(chips).toHaveCount(0);

  await page.getByRole("button", { name: "Vault: All vaults" }).click();
  await vaults.getByRole("button", { name: /^Personal/ }).click();
  await expect(vaults).toHaveCount(0);
  await expectListed(page, [alpha, beta]);

  await page.getByRole("button", { name: /^Account/ }).click();
  const account = page.getByRole("dialog");
  await expect(account.getByRole("link", { name: /^Pass Monitor/ })).toBeVisible();
  await expect(account.getByRole("button", { name: /^Sync status: / })).toBeVisible();
  await account.getByRole("button", { name: "Lock vault" }).click();
  await expect(page.locator('input[name="password"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Filter", exact: true })).toHaveCount(0);
});
