// React Native has no web workers: rate on the JS thread, after the frame that asked for it.
import type { PasswordStrength } from "@repo/util";
import { getStrengthFromString, loadPasswordStrength } from "../password-strength";

class StrengthNativeService {
  async rate(password: string, userInputs: string[] = []): Promise<PasswordStrength | null> {
    await loadPasswordStrength();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return getStrengthFromString(password, userInputs);
  }

  terminate(): void {}
}

export const strengthWorkerService = new StrengthNativeService();
