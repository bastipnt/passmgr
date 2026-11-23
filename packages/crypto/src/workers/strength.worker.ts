import { getStrengthFromString, loadPasswordStrength } from "../password-strength";
import { serveOffThread } from "../util/worker-client";

export type StrengthRequest = { password: string; userInputs: string[] };

serveOffThread<StrengthRequest>(async ({ password, userInputs }) => {
  await loadPasswordStrength();
  return { result: getStrengthFromString(password, userInputs) };
}, "Strength check failed");
