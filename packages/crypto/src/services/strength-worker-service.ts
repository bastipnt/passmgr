import type { PasswordStrength } from "@repo/util";
import { getStrengthFromString, loadPasswordStrength } from "../password-strength";
import { runOffThread, WorkerClient } from "../util/worker-client";
import type { StrengthRequest } from "../workers/strength.worker";
// oxlint-disable-next-line import/default -- Vite ?worker import
import StrengthWorker from "../workers/strength.worker.ts?worker";

const client = new WorkerClient(() => new StrengthWorker(), "Strength worker");

/** zxcvbn takes 100–500 ms per password: off the main thread, so a record or keystroke never stalls. */
export const strengthWorkerService = {
  rate(password: string, userInputs: string[] = []): Promise<PasswordStrength | null> {
    return runOffThread(
      () =>
        client.request<PasswordStrength | null>({ password, userInputs } satisfies StrengthRequest),
      () => loadPasswordStrength().then(() => getStrengthFromString(password, userInputs)),
    );
  },

  terminate(error?: Error): void {
    client.terminate(error);
  },
};
