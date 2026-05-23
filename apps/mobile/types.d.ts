/**
 * Ambient type declarations for the mobile app.
 *
 * The cross-platform `@repo/client` barrel re-exports modules that depend on
 * web-only constructs (e.g. `tinykeys`). Those modules are never imported at
 * runtime on mobile, but `tsc` still walks the dep graph and fails without
 * these shims.
 */

/**
 * ES2024 Uint8Array base64 helpers — supported at runtime by the JS engine
 * Hermes ships, but the TS 5.9 stdlib doesn't declare them yet. Mirrors the
 * root `types.d.ts` (which mobile doesn't include because mobile extends
 * expo's tsconfig, not the workspace base).
 */
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

declare module "react-native" {
  interface ViewProps {
    className?: string;
    cssInterop?: boolean;
  }
  interface TextProps {
    className?: string;
    cssInterop?: boolean;
  }
  interface TextInputProps {
    className?: string;
    placeholderClassName?: string;
  }
  interface TouchableWithoutFeedbackProps {
    className?: string;
    cssInterop?: boolean;
  }
  interface PressableProps {
    className?: string;
    cssInterop?: boolean;
  }
  interface ScrollViewProps {
    contentContainerClassName?: string;
    indicatorClassName?: string;
  }
  interface ImagePropsBase {
    className?: string;
    cssInterop?: boolean;
  }
}

export {};
