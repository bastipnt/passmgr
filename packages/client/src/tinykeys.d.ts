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
