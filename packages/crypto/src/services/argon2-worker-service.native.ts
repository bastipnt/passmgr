// Main-thread Argon2id for React Native. `argon2idAsync` resolves to the native
// libsodium implementation (argon2-impl.native.ts), which runs off the JS thread,
// so no web worker is needed here.
import { argon2idAsync } from "../util/argon2-impl";

type ArgonParams = { t: number; m: number; p: number };

class Argon2NativeService {
  derive(password: string, salt: Uint8Array, params: ArgonParams): Promise<Uint8Array> {
    return argon2idAsync(password, salt, params);
  }

  terminate(): void {}
}

export const argon2WorkerService = new Argon2NativeService();
