import { expect, test } from "@playwright/test";
import {
  loginUser,
  randomEmail,
  randomPassword,
  registerUser,
  signOut,
  skipBiometricIfShown,
} from "./helpers/auth";
import { expectSynced } from "./helpers/vault";

test.describe("register → sign out → login", () => {
  test("a brand-new user can register, sign out, and come back", async ({ page }) => {
    const email = randomEmail();
    const password = randomPassword();

    await registerUser(page, email, password);

    await loginUser(page, email, password);
    await skipBiometricIfShown(page);
    await expect(page).toHaveURL(/\/(\?.*)?$/);

    await signOut(page);
    await loginUser(page, email, password);
    await skipBiometricIfShown(page);
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    // Signed in to the server again, not only unlocked on the device.
    await expectSynced(page);
  });
});
