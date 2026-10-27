import { expect, type Locator, type Page, test } from "@playwright/test";
import { randomPassword } from "./helpers/auth";
import {
  createLocalVault,
  createLogin,
  createRecord,
  editRecord,
  expectRecord,
  fillRecordForm,
  openCreateForm,
  openEditForm,
  type RecordFields,
  recordSheet,
  submitCreateForm,
  submitEditForm,
} from "./helpers/vault";

/** The one record form, for every type: create and edit, reordering, generated secrets, tags on a phone. */

const TYPES: { type: string; create: RecordFields; edit: RecordFields }[] = [
  {
    type: "Login",
    create: { title: "Steam", username: "gabe", email: "gabe@example.test", password: "s3cret!" },
    edit: { username: "gaben", totp: "JBSWY3DPEHPK3PXP" },
  },
  {
    type: "Credit card",
    create: { title: "Visa", cardholderName: "Ada Lovelace", number: "4111 1111 1111 1111" },
    edit: { expiry: "12/30", securityCode: "123" },
  },
  {
    type: "Identity",
    create: { title: "Me", firstName: "Ada", lastName: "Lovelace" },
    edit: { postalCode: "10115", city: "Berlin" },
  },
  {
    type: "Secure note",
    create: { title: "Wiki", note: "first line" },
    edit: { note: "second line" },
  },
  {
    type: "SSH key",
    create: { title: "Laptop", publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI laptop" },
    edit: { passphrase: "correct horse" },
  },
  {
    type: "API key",
    create: { title: "Stripe", keyId: "sk_live_1", secret: "abc123" },
    edit: { host: "api.stripe.com" },
  },
  {
    type: "Wi-Fi",
    create: { title: "Home", ssid: "HomeNet", password: "wifi-pass" },
    edit: { ssid: "HomeNet 5G" },
  },
];

/** Drag a sortable row by its handle onto the row of `target`'s handle. */
async function dragHandle(page: Page, handle: Locator, target: Locator): Promise<void> {
  // Rows measured while the sheet still slides in would be off by the slide.
  let last: string | undefined;
  await expect
    .poll(async () => {
      const box = JSON.stringify(await handle.boundingBox());
      const settled = box === last;
      last = box;
      return settled;
    })
    .toBe(true);
  // Clear of the sheet's sticky header and footer.
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag handle not laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 4, { steps: 8 });
  await page.mouse.up();
}

test("creates and edits a record of every type", async ({ page }) => {
  await createLocalVault(page, "Types", randomPassword());

  for (const { type, create, edit } of TYPES) {
    const recordId = await createRecord(page, type, create);
    await expect(page.getByRole("heading", { level: 1, name: create.title })).toBeVisible();

    await editRecord(page, recordId, { ...edit, title: `${create.title} 2` });
    await expect(page.getByRole("heading", { level: 1, name: `${create.title} 2` })).toBeVisible();
    await expectRecord(page, recordId, { ...create, ...edit, title: `${create.title} 2` });
  }
});

test("the edit sheet shows the record's header and footer", async ({ page }) => {
  await createLocalVault(page, "Chrome", randomPassword());
  const recordId = await createLogin(page, { title: "Steam", username: "gabe" });

  await openEditForm(page, recordId);
  const sheet = recordSheet(page);
  await expect(sheet.getByRole("heading", { name: "Edit login" })).toBeVisible();
  await expect(sheet.getByText(/^Steam · last changed /)).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await expect(sheet.getByText("Every save keeps a version")).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
});

test("reorders websites and extra fields by dragging, generates a hidden field's value", async ({
  page,
}) => {
  await createLocalVault(page, "Reorder", randomPassword());
  await openCreateForm(page, "Login");
  const sheet = recordSheet(page);
  await fillRecordForm(page, { title: "GitHub" });
  for (const website of ["https://github.com", "https://gist.github.com"]) {
    await sheet.getByRole("button", { name: "Add website" }).click();
    await sheet.locator('[name^="websites."][name$=".value"]').last().fill(website);
  }
  for (const [kind, title] of [
    ["Text", "Team"],
    ["Hidden", "Deploy token"],
  ] as const) {
    await sheet.getByRole("button", { name: "Add field" }).click();
    await page.getByRole("menuitem", { name: kind, exact: true }).click();
    await sheet.getByRole("textbox", { name: "Field label" }).last().fill(title);
  }
  await fillRecordForm(page, { "customFields.0.value": "core" });

  await sheet.getByRole("button", { name: "Generate deploy token" }).click();
  await page.getByRole("button", { name: "Use", exact: true }).click();
  await expect(sheet.locator('[name="customFields.1.value"]')).not.toHaveValue("");
  const token = await sheet.locator('[name="customFields.1.value"]').inputValue();
  const recordId = await submitCreateForm(page);

  await openEditForm(page, recordId);
  await dragHandle(
    page,
    sheet.getByRole("button", { name: "Move https://github.com" }),
    sheet.getByRole("button", { name: "Move https://gist.github.com" }),
  );
  await dragHandle(
    page,
    sheet.getByRole("button", { name: "Move Deploy token" }),
    sheet.getByRole("button", { name: "Move Team" }),
  );
  await submitEditForm(page);

  await expectRecord(page, recordId, {
    "websites.0.value": "https://gist.github.com",
    "websites.1.value": "https://github.com",
    "customFields.0.title": "Deploy token",
    "customFields.0.value": token,
    "customFields.1.title": "Team",
  });
});

test("phone: the form stacks in the 16px gutter and tags wrap onto more lines", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createLocalVault(page, "Phone", randomPassword());
  await openCreateForm(page, "Login");
  await fillRecordForm(page, { title: "Steam" });

  const sheet = recordSheet(page);
  const tagInput = sheet.getByRole("combobox", { name: "Tags" });
  const tags = ["gaming", "personal", "shared-with-family", "important", "subscriptions"];
  for (const tag of tags) {
    await tagInput.fill(tag);
    await tagInput.press("Enter");
  }
  const first = await sheet.getByLabel(tags[0] as string, { exact: true }).boundingBox();
  const last = await sheet.getByLabel(tags.at(-1) as string, { exact: true }).boundingBox();
  expect(last?.y).toBeGreaterThan(first?.y ?? Number.POSITIVE_INFINITY);

  const box = await sheet
    .locator('[data-slot="field-box"]', { has: page.getByRole("combobox", { name: "Tags" }) })
    .boundingBox();
  expect(box?.x).toBeCloseTo(16, 0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeCloseTo(390 - 16, 0);
  const overflows = await sheet.evaluate((el) => {
    const scroller = el.querySelector('[data-slot="drawer-content"]') ?? el;
    return scroller.scrollWidth > scroller.clientWidth;
  });
  expect(overflows).toBe(false);

  await submitCreateForm(page);
});
