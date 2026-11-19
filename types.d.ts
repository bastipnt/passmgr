// Uint8Array base64 methods: the workspace lib (`es2022`) doesn't declare them. Included by every package.
declare global {
  interface Uint8Array {
    toBase64(): string;
  }

  interface Uint8ArrayConstructor {
    fromBase64(base64: string): Uint8Array;
  }
}

export {};
