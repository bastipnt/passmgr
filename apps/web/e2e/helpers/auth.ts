import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

export function randomEmail(): string {
  return `e2e-${randomBytes(8).toString("hex")}@example.test`;
}

export function randomPassword(): string {
  return `pw-${randomBytes(16).toString("base64url")}`;
}

/**
 * Drive the register UI end-to-end, including the recovery-key dialog.
 * Returns the base64 recovery key as displayed (useful for leakage assertions
 * and the future recovery flow).
 */
export async function registerUser(page: Page, email: string, password: string): Promise<string> {
  // The /register route is conditionally rendered in AuthRoutes only after
  // useAppConfig().registrationEnabled resolves to true (defaults to false
  // while the tRPC query is pending). Each page.goto() creates a fresh
  // QueryClient, so a direct goto("/register") races the query and gets
  // redirected to /login. Land on /login, wait for the "Sign Up" link to
  // appear in the CardAction (which only renders once registrationEnabled is
  // true), then SPA-navigate by clicking it — no full reload.
  await page.goto("/login");
  const signUpLink = page.locator('a[href="/register"]');
  await expect(signUpLink).toBeVisible({ timeout: 15_000 });
  await signUpLink.click();
  await expect(page).toHaveURL(/\/register$/);

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();

  // Recovery dialog opens with the key. Argon2id at prod params (~250ms)
  // dominates registration timing; total round-trip is comfortably under 30s.
  await expect(page.getByText(/save your recovery key/i)).toBeVisible({ timeout: 30_000 });
  const recoveryKey = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(recoveryKey).not.toBe("");

  await page.getByRole("button", { name: /copy to clipboard/i }).click();
  await page.getByRole("button", { name: /i saved it/i }).click();

  return recoveryKey;
}

/** OPAQUE login through the LoginForm; resolves when redirected away from /login. */
export async function loginUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
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
 * storage + cookies + OPFS, then reload — equivalent to a fresh tab on a
 * different device.
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
  await page.goto("/login");
}
