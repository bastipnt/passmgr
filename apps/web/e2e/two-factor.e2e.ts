import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import {
  loginUser,
  openAccountLogin,
  randomEmail,
  randomPassword,
  registerUser,
  simulateLogout,
} from "./helpers/auth";
import { test } from "./helpers/devices";
import { expectInApp, expectSynced, reloadAndSubmitUnlock } from "./helpers/vault";

/**
 * Two-factor for the server login (TOTP + backup codes), opt-in. Turned on in
 * Settings → Security; then every login to the server asks for a code: the
 * login form, the reconnect after an offline unlock and the fresh login of a
 * change. Turned off, logins are password-only again.
 */

const STEP_MS = 30_000;
const currentStep = () => Math.floor(Date.now() / STEP_MS);

function base32Decode(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of text) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** RFC 6238 (SHA-1, 6 digits, 30s): what an authenticator app shows for `step`. */
function totp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/**
 * A code for a TOTP step no login used yet: the server takes each step once,
 * so this waits for the next step when the current one is taken.
 */
async function freshCode(secret: string, used: Set<number>): Promise<string> {
  while (used.has(currentStep())) {
    await new Promise((resolve) => setTimeout(resolve, STEP_MS - (Date.now() % STEP_MS) + 200));
  }
  const step = currentStep();
  used.add(step);
  return totp(secret, step);
}

async function openSecuritySettings(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Security", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);
}

async function backToVault(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectInApp(page);
}

/** Turn two-factor on; returns the secret and the backup codes. */
async function enableTwoFactor(page: Page, password: string, used: Set<number>) {
  await openSecuritySettings(page);
  await expect(page.getByText("Two-factor authentication is off")).toBeVisible();
  await page.getByRole("button", { name: "Turn on", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="password"]').fill(password);
  await dialog.getByRole("button", { name: "Continue" }).click();

  const key = dialog.getByLabel("Setup key");
  await expect(key).toBeVisible({ timeout: 30_000 });
  const secret = (await key.getAttribute("data-secret")) ?? "";
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  await expect(dialog.getByRole("img", { name: /qr code/i })).toBeVisible();

  await dialog.locator('input[name="code"]').fill(await freshCode(secret, used));
  await dialog.getByRole("button", { name: "Turn on", exact: true }).click();

  const list = dialog.getByRole("list", { name: "Backup codes" });
  await expect(list).toBeVisible({ timeout: 30_000 });
  const backupCodes = await list.getByRole("listitem").allTextContents();
  expect(backupCodes).toHaveLength(10);
  await dialog.getByRole("button", { name: "Copy", exact: true }).click();
  await dialog.getByRole("button", { name: "I saved them" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByText("Two-factor authentication is on")).toBeVisible();
  await expect(page.getByText(/10 backup codes left/)).toBeVisible();
  return { secret, backupCodes };
}

/** Submit a code in the code step (on the account login or in the prompt dialog). */
async function enterCode(
  scope: Page | ReturnType<Page["getByRole"]>,
  code: string,
  backup = false,
) {
  const toBackup = scope.getByRole("button", { name: "Use a backup code" });
  if (backup && (await toBackup.isVisible())) await toBackup.click();
  const input = scope.getByLabel(backup ? "Backup code" : "Authentication code");
  await input.fill(code);
  await scope.getByRole("button", { name: "Verify" }).click();
}

/** The account login up to the code step. */
async function startLogin(page: Page, email: string, password: string): Promise<void> {
  await openAccountLogin(page);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByLabel("Authentication code")).toBeVisible({ timeout: 30_000 });
}

/** After the account login's code step: resolves once the vault is open. */
async function expectLoggedIn(page: Page): Promise<void> {
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await expectInApp(page);
}

test("two-factor: off by default, then every server login asks for a code until it's off again", async ({
  page,
  secondDevice,
  thirdDevice,
}) => {
  // Waits for fresh TOTP steps (up to 30s each).
  test.setTimeout(240_000);
  const email = randomEmail();
  const password = randomPassword();
  const used = new Set<number>();

  await registerUser(page, email, password);
  // Off by default: the plain login (the other suites rely on it too).
  await loginUser(page, email, password);
  await expectInApp(page);

  const { secret, backupCodes } = await enableTwoFactor(page, password, used);
  await backToVault(page);

  // Another device: the password alone gets no further than the code step. A
  // wrong code is turned down, the app's current code signs in.
  await startLogin(secondDevice, email, password);
  await enterCode(secondDevice, "000000");
  await expect(secondDevice.getByText(/that code didn.t work/i)).toBeVisible({ timeout: 30_000 });
  await enterCode(secondDevice, await freshCode(secret, used));
  await expectLoggedIn(secondDevice);
  await expectSynced(secondDevice);

  // A backup code signs in too, once.
  await startLogin(thirdDevice, email, password);
  await enterCode(thirdDevice, backupCodes[0]!, true);
  await expectLoggedIn(thirdDevice);
  await expectSynced(thirdDevice);

  // Offline unlock, then the reconnect: the vault opens with the password
  // alone, the server session waits for the code (a dialog over the app).
  // The prompt can open before the record list is checked, and while it's
  // open the app is aria-hidden: wait for the vault only once it's answered.
  await reloadAndSubmitUnlock(page, password);
  const prompt = page.getByRole("dialog", { name: "Two-factor authentication" });
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await enterCode(prompt, backupCodes[0]!, true);
  await expect(prompt.getByText(/that code didn.t work/i)).toBeVisible({ timeout: 30_000 });
  await enterCode(prompt, backupCodes[1]!, true);
  await expect(prompt).toHaveCount(0, { timeout: 30_000 });
  await expectInApp(page);
  await expectSynced(page);

  // Turning it off: the master password, and the code its fresh login asks for.
  await openSecuritySettings(page);
  await expect(page.getByText(/8 backup codes left/)).toBeVisible();
  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Turn off two-factor?" });
  await dialog.locator('input[name="password"]').fill(password);
  await dialog.getByRole("button", { name: "Turn off", exact: true }).click();
  const offPrompt = page.getByRole("dialog", { name: "Two-factor authentication" });
  await expect(offPrompt).toBeVisible({ timeout: 30_000 });
  await enterCode(offPrompt, await freshCode(secret, used));
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("Two-factor authentication is off")).toBeVisible();

  // Password-only again.
  await simulateLogout(secondDevice);
  await loginUser(secondDevice, email, password);
  await expectInApp(secondDevice);
});
