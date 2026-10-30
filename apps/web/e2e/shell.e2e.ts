import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers/a11y";
import { randomPassword } from "./helpers/auth";
import {
  createLocalVault,
  createLogin,
  expectListed,
  expectLogin,
  lockFromSidebar,
  openPasswordIssues,
  reloadAndUnlock,
  searchField,
  searchOptions,
} from "./helpers/vault";

/**
 * The Shell v3 pieces outside the list layout: accent presets, the desktop
 * search panel, and a login's detail (email, password health).
 */

test("accent: picked in Settings → General, kept over a reload, used by the auth screen and the logo", async ({
  page,
}) => {
  const password = randomPassword();
  await createLocalVault(page, "Accent", password);
  await expect(page.locator("html")).toHaveAttribute("data-accent", "berry");

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "General Settings" }).click();
  await page
    .getByRole("radiogroup", { name: "Accent" })
    .getByRole("radio", { name: "Pine" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "pine");
  await expectAccessible(page);

  // Web lock reloads the page: the unlock screen shows the stored accent.
  await page.getByRole("button", { name: "Back" }).click();
  await lockFromSidebar(page);
  await expect(page.locator("html")).toHaveAttribute("data-accent", "pine");
  const logo = page.locator('[data-slot="brand-mark"]').first();
  await expect(logo).toBeVisible();
  await expectAccessible(page);
  // Resolved through a probe: computed colours compare in one format, the token doesn't.
  const logoUsesAccent = await logo.evaluate((mark) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--color-primary)";
    document.body.append(probe);
    const primary = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return getComputedStyle(mark).backgroundColor === primary;
  });
  expect(logoUsesAccent).toBe(true);

  await reloadAndUnlock(page, password);
  await expect(page.locator("html")).toHaveAttribute("data-accent", "pine");
});

test("search: records by email, # tag mode, scope with Search all items, Clear all", async ({
  page,
}) => {
  await createLocalVault(page, "Search", randomPassword());
  const alpha = await createLogin(page, {
    title: "Alpha",
    email: "alpha@example.test",
    tags: ["work", "finance"],
  });
  const beta = await createLogin(page, { title: "Beta", tags: ["work"] });
  const search = searchField(page);

  await search.fill("alpha@");
  await expect(searchOptions(page).filter({ hasText: "Alpha" })).toBeVisible();
  await expect(searchOptions(page).filter({ hasText: "Beta" })).toHaveCount(0);
  await search.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/record/${alpha}$`));
  await expect(search).toHaveValue("");

  await search.fill("#");
  await expect(page.getByRole("combobox", { name: "Search tags" })).toBeFocused();
  const finance = searchOptions(page, "Tags").filter({ hasText: "finance" });
  await finance.click();
  await expect(finance).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  const chips = page.getByRole("list", { name: "Active filters" });
  await expect(chips.getByRole("button", { name: "Remove tag finance" })).toBeVisible();
  await expectListed(page, [alpha]);

  // A match the filters hide is counted, and "Search all items" widens to it.
  await search.fill("Beta");
  await expect(page.getByRole("list", { name: "Search scope" })).toContainText("#finance");
  await expect(searchOptions(page).filter({ hasText: "Beta" })).toHaveCount(0);
  await expect(page.getByText("1 more outside #finance")).toBeVisible();
  // The panel's own, not the empty detail's (pressing that one would blur the field and close the panel).
  await page
    .getByText("1 more outside #finance")
    .locator("xpath=../..")
    .getByRole("button", { name: "Search all items" })
    .click();
  await expect(searchOptions(page).filter({ hasText: "Beta" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Search scope" })).not.toContainText("#finance");
  await page.keyboard.press("Escape");

  await page
    .getByRole("navigation", { name: "Categories" })
    .getByRole("button", { name: /^Logins/ })
    .click();
  await expect(chips.getByRole("button", { name: "Remove filter Logins" })).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(chips).toHaveCount(0);
  await expectListed(page, [alpha, beta]);
});

test("login detail: email as the account, password health line with its issues", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await createLocalVault(page, "Health", randomPassword());
  const github = await createLogin(page, {
    title: "GitHub",
    email: "jana@example.test",
    password: "password1",
    website: "https://github.com",
  });
  const figma = await createLogin(page, {
    title: "Figma",
    username: "jana",
    password: "password1",
  });

  await expect(page.locator(`a[href="/record/${github}"]`)).toContainText("jana@example.test");
  await expectLogin(page, github, { email: "jana@example.test", username: "" });

  await expect(page.getByRole("button", { name: "3 issues" })).toBeVisible({ timeout: 15_000 });
  const issues = await openPasswordIssues(page);
  await expect(issues.getByRole("listitem")).toHaveCount(3);
  await expect(issues).toContainText(/weak password/i);
  await expect(issues).toContainText("Reused");
  await expect(issues).toContainText("No two-factor code");
  await expect(issues.getByRole("link", { name: "Set up" })).toHaveAttribute("href", /^https:\/\//);

  await issues.getByRole("link", { name: "Figma" }).click();
  await expect(page).toHaveURL(new RegExp(`/record/${figma}$`));
});
