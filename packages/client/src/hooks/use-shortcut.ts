import { useEffect, useRef } from "react";
import {
  type ShortcutEntry,
  useShortcutContext,
  useShortcutLayerDepth,
} from "../providers/ShortcutProvider";

interface UseShortcutOptions {
  /** Human-readable description (for the help dialog / Kbd hints) */
  description?: string;
  /** Whether the shortcut is active. Defaults to true. */
  enabled?: boolean;
  /** Fire even when an input/textarea is focused. Defaults to false. */
  allowInInput?: boolean;
  /**
   * Call `preventDefault()` before the handler. Defaults to true; pass false to leave the key
   * to the browser as well (Esc still closing a native dialog).
   */
  preventDefault?: boolean;
}

/**
 * Register a global keyboard shortcut that is automatically cleaned up on unmount.
 *
 * Key syntax follows tinykeys: https://github.com/jamiebuilds/tinykeys
 *   - `$mod` = Cmd on Mac, Ctrl on Windows/Linux
 *   - `$mod+k`, `$mod+Shift+c`, `Escape`, `ArrowDown`, etc.
 *
 * @example
 * useShortcut("$mod+k", () => searchInputRef.current?.focus(), {
 *   description: "Focus search",
 * });
 */
export function useShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options: UseShortcutOptions = {},
) {
  const { description, enabled = true, allowInInput = false, preventDefault = true } = options;
  const { register } = useShortcutContext();
  // Read during render: child effects run before parent effects, so resolving
  // the depth inside the effect below would register at the parent's layer.
  const layer = useShortcutLayerDepth();

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const entry: ShortcutEntry = {
      key,
      description,
      allowInInput,
      preventDefault,
      layer,
      handler: (e) => handlerRef.current(e),
    };

    return register(entry);
  }, [key, description, enabled, allowInInput, preventDefault, layer, register]);
}
