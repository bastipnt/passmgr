import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export function randomEmail(): string {
  return `e2e-${randomBytes(8).toString("hex")}@example.test`;
}

export function randomPassword(): string {
  return `pw-${randomBytes(16).toString("base64url")}`;
}

/**
 * Open the create flow and fill step 1. Resolves once the app config is in:
 * only then does the flow know whether the sync step follows ("Step 1 of 2").
 */
export async function startCreateVault(
  page: Page,
  password: string,
  { name, withSync = true }: { name?: string; withSync?: boolean } = {},
): Promise<void> {
  await page.goto("/create");
  if (withSync) await expect(page.getByText("Step 1 of 2")).toBeVisible({ timeout: 15_000 });
  if (name) await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(password);
  await page.locator('form button[type="submit"]').click();
}

/** Confirm the recovery-key dialog; resolves the key as displayed. */
export async function saveRecoveryKey(page: Page): Promise<string> {
  // Argon2id at prod params dominates; the round-trip is comfortably under 30s.
  await expect(page.getByText(/save your recovery key/i)).toBeVisible({ timeout: 30_000 });
  const recoveryKey = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(recoveryKey).not.toBe("");
  await page.getByRole("button", { name: /copy to clipboard/i }).click();
  await page.getByRole("button", { name: /i saved it/i }).click();
  return recoveryKey;
}

/**
 * Create a vault with sync on: a local vault linked to a new account, left
 * unlocked. Returns the base64 recovery key as displayed (useful for leakage
 * assertions and the recovery flow).
 */
export async function registerUser(page: Page, email: string, password: string): Promise<string> {
  await startCreateVault(page, password);
  await page.getByRole("button", { name: /yes, sync this vault/i }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: /create account/i }).click();
  const recoveryKey = await saveRecoveryKey(page);
  await page.waitForURL((url) => !url.pathname.startsWith("/create"), { timeout: 15_000 });
  return recoveryKey;
}

/** The account login (email + password); a fresh page load, so nothing is unlocked. */
export async function openAccountLogin(page: Page): Promise<void> {
  await page.goto("/login/account");
  await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 15_000 });
}

/** From the last used profile's unlock card, "Switch" to the list of every profile. */
export async function showProfiles(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^switch$/i }).click();
  await expect(page.getByRole("list", { name: /vaults on this device/i })).toBeVisible();
}

/** OPAQUE login on the account login; resolves when redirected away from it. */
export async function loginUser(page: Page, email: string, password: string): Promise<void> {
  await openAccountLogin(page);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

/**
 * Submit the login form on screen with `password` (and `email`, for the email
 * login; an unlock card asks for the password only) and expect it turned down.
 */
export async function expectLoginRejected(
  page: Page,
  password: string,
  email?: string,
): Promise<void> {
  if (email !== undefined) await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText(/that didn.t work/i)).toBeVisible({ timeout: 30_000 });
}

/** Click the "Skip" button on /enroll-biometric if present. */
export async function skipBiometricIfShown(page: Page): Promise<void> {
  if (page.url().includes("/enroll-biometric")) {
    await page.getByRole("button", { name: /^skip$/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/enroll-biometric"));
  }
}

/**
 * There is no logout UI yet. Drop the in-memory session by clearing local
 * storage + cookies + OPFS, then open the account login — equivalent to a
 * fresh tab on a different device.
 */
export async function simulateLogout(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if ("storage" in navigator && "getDirectory" in navigator.storage) {
      try {
        const root = await navigator.storage.getDirectory();
        for await (const [name] of root as unknown as AsyncIterable<[string]>) {
          await root.removeEntry(name, { recursive: true }).catch(() => {});
        }
      } catch {
        // OPFS may not be available in every context; ignore.
      }
    }
  });
  await openAccountLogin(page);
}
