// oxlint-disable-next-line import/default -- Vite ?worker import
import Argon2Worker from "../workers/argon2.worker.ts?worker";

type ArgonParams = { t: number; m: number; p: number };

class Argon2WorkerService {
  private worker: Worker | null = null;

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Argon2Worker();
    }
    return this.worker;
  }

  derive(password: string, salt: Uint8Array, params: ArgonParams): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const worker = this.getWorker();

      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data as
          | { type: "result"; key: ArrayBuffer }
          | { type: "error"; message: string };

        if (msg.type === "result") {
          resolve(new Uint8Array(msg.key));
        } else {
          reject(new Error(msg.message));
        }
      };

      const saltCopy = salt.slice();
      worker.postMessage(
        { type: "derive", password, salt: saltCopy.buffer, params },
        [saltCopy.buffer],
      );
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

export const argon2WorkerService = new Argon2WorkerService();
