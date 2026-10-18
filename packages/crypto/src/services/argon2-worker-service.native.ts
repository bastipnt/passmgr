// Main-thread Argon2 for React Native. Argon2id over a string password resolves to the
// native react-native-argon2 implementation (argon2-impl.native.ts), which runs off the JS
// thread, so no web worker is needed here. Argon2d and binary passwords (KeePass) run on
// @noble, on the JS thread.
import { type Argon2Params, argon2Async } from "../util/argon2-impl";

class Argon2NativeService {
  derive(
    password: string | Uint8Array,
    salt: Uint8Array,
    params: Argon2Params,
  ): Promise<Uint8Array> {
    const { variant = "argon2id", ...opts } = params;
    return argon2Async(variant, password, salt, opts);
  }

  terminate(): void {}
}

export const argon2WorkerService = new Argon2NativeService();
