// The `@repo/client` barrel reaches web-only modules (`tinykeys`) that never run on mobile, but `tsc` walks them.

// Hermes has the Uint8Array base64 methods; the root `types.d.ts` isn't included (expo's tsconfig, not the base).
declare global {
  interface Uint8Array {
    toBase64(): string;
  }
  interface Uint8ArrayConstructor {
    fromBase64(base64: string): Uint8Array;
  }
}

declare module "tinykeys" {
  type KeyBindingMap = Record<string, (event: KeyboardEvent) => void>;

  interface TinykeysOptions {
    event?: "keydown" | "keyup";
    timeout?: number;
  }

  export function tinykeys(
    target: Window | HTMLElement,
    keyBindingMap: KeyBindingMap,
    options?: TinykeysOptions,
  ): () => void;
}

export {};
