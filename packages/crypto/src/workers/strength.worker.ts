import { getStrengthFromString, loadPasswordStrength } from "../password-strength";

type StrengthRequest = { id: number; password: string; userInputs: string[] };

self.onmessage = async (event: MessageEvent<StrengthRequest>) => {
  const { id, password, userInputs } = event.data;
  try {
    await loadPasswordStrength();
    self.postMessage({ id, strength: getStrengthFromString(password, userInputs) });
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : "Strength check failed" });
  }
};
