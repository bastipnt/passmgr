import type { PasswordStrength } from "@repo/util";
import { getStrengthFromString, loadPasswordStrength } from "../password-strength";
// oxlint-disable-next-line import/default -- Vite ?worker import
import StrengthWorker from "../workers/strength.worker.ts?worker";

type Pending = {
  resolve: (strength: PasswordStrength | null) => void;
  reject: (error: Error) => void;
};

/** zxcvbn takes 100–500 ms per password: off the main thread, so a record or keystroke never stalls. */
class StrengthWorkerService {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new StrengthWorker();
    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as
        | { id: number; strength: PasswordStrength | null }
        | { id: number; error: string };
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if ("error" in msg) entry.reject(new Error(msg.error));
      else entry.resolve(msg.strength);
    };
    // E.g. the worker script can't be fetched (offline, not yet cached): fail what's waiting
    // and drop the worker so the next call retries.
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      this.terminate(new Error(`Strength worker failed: ${event.message || "could not load"}`));
    };
    this.worker = worker;
    return worker;
  }

  rate(password: string, userInputs: string[] = []): Promise<PasswordStrength | null> {
    // Node (tests, scripts) has no Worker.
    if (typeof Worker === "undefined")
      return loadPasswordStrength().then(() => getStrengthFromString(password, userInputs));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.getWorker().postMessage({ id, password, userInputs });
    });
  }

  terminate(error = new Error("Strength worker terminated")): void {
    this.worker?.terminate();
    this.worker = null;
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }
}

export const strengthWorkerService = new StrengthWorkerService();
