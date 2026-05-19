import { expect, test } from "@playwright/test";
import {
  loginUser,
  randomEmail,
  randomPassword,
  registerUser,
  simulateLogout,
  skipBiometricIfShown,
} from "./helpers/auth";

test.describe("register → simulated logout → login", () => {
  test("a brand-new user can register, leave, and come back", async ({ page }) => {
    const email = randomEmail();
    const password = randomPassword();

    await registerUser(page, email, password);
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    await loginUser(page, email, password);
    await skipBiometricIfShown(page);
    await expect(page).toHaveURL(/\/(\?.*)?$/);

    await simulateLogout(page);
    await loginUser(page, email, password);
    await skipBiometricIfShown(page);
    await expect(page).toHaveURL(/\/(\?.*)?$/);
  });
});
