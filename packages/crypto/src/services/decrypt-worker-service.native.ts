// Main-thread record decryption for React Native. XChaCha20-Poly1305 decryption
// is fast enough to run on the JS thread, so no web worker is needed here.
import { InThreadDecryptService } from "../decrypt-in-thread";

export const decryptWorkerService = new InThreadDecryptService();
