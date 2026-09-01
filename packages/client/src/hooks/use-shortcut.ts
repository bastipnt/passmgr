import { useEffect, useRef } from "react";
import {
  type ShortcutEntry,
  useShortcutContext,
  useShortcutLayerDepth,
} from "../providers/ShortcutProvider";

interface UseShortcutOptions {
  /** Human-readable description (for future help dialog / Kbd hints) */
  description?: string;
  /** Whether the shortcut is active. Defaults to true. */
  enabled?: boolean;
  /** Fire even when an input/textarea is focused. Defaults to false. */
  allowInInput?: boolean;
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
  const { description, enabled = true, allowInInput = false } = options;
  const { register } = useShortcutContext();
  // Read during render: child effects run before parent effects, so resolving
  // the depth inside the effect below would register at the parent's layer.
  const layer = useShortcutLayerDepth();

  // Keep handler ref stable so we don't re-register on every render
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const entry: ShortcutEntry = {
      key,
      description,
      allowInInput,
      layer,
      handler: (e) => handlerRef.current(e),
    };

    return register(entry);
  }, [key, description, enabled, allowInInput, layer, register]);
}
