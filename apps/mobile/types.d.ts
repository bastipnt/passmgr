// The `@repo/client` barrel reaches web-only modules (`tinykeys`) that never run on mobile, but `tsc` walks them.

declare module "react-native-sse" {
  // Real runtime field the shipped types omit; EventSource.CLOSED etc. map from it.
  export default interface EventSource<E extends string = never> {
    status: number;
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
