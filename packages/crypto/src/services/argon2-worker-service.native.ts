// No worker on mobile: react-native-argon2 runs off the JS thread (packages/crypto/CLAUDE.md).
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
