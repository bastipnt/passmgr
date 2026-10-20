import { expect } from "@playwright/test";
import { loginUser, randomEmail, randomPassword, registerUser } from "./helpers/auth";
import { test } from "./helpers/devices";
import { expectInApp } from "./helpers/vault";

/**
 * Idle lock (`useIdleLock`, Settings → Security "Lock when idle"): with no
 * pointer / key activity for the configured time the vault locks: the page
 * reloads (drops every key) after ending the server session. The clock is
 * faked, so a minute passes instantly.
 */
test("idle timeout locks the vault and ends its server session", async ({ page, secondDevice }) => {
  test.setTimeout(120_000);
  const email = randomEmail();
  const password = randomPassword();

  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("pass-mgr-auto-lock", "1"));

  // Leaves the vault unlocked and signed in: the session the idle lock ends.
  await registerUser(page, email, password);
  await expectInApp(page);

  // Activity restarts the countdown.
  await page.clock.fastForward("00:45");
  await page.keyboard.press("Shift");
  await page.clock.fastForward("00:45");
  await expectInApp(page);

  await page.clock.fastForward("00:20");
  await expect(page.locator('input[name="password"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "New record", exact: true })).toHaveCount(0);

  // Only the second device is still signed in.
  await loginUser(secondDevice, email, password);
  await expectInApp(secondDevice);
  await secondDevice.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(secondDevice).toHaveURL(/\/settings\/account$/);
  const devices = secondDevice.getByRole("list", { name: "Signed-in devices" });
  await expect(devices.getByRole("listitem")).toHaveCount(1);
  await expect(devices).toContainText("(this device)");
});
