import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { tinykeys } from "tinykeys";

export interface ShortcutEntry {
  /** tinykeys key binding string, e.g. "$mod+k" */
  key: string;
  /** Shown in the keyboard shortcuts help dialog. */
  description?: string;
  handler: (e: KeyboardEvent) => void;
  /**
   * If true the shortcut fires even when an input/textarea/contenteditable
   * element is focused. Defaults to false.
   */
  allowInInput?: boolean;
  /** Call `preventDefault()` before the handler. Defaults to true. */
  preventDefault?: boolean;
  /**
   * Nesting depth of the overlay this shortcut was registered under. 0 is the
   * base app; each active `<ShortcutLayer>` above it adds one. Only entries on
   * the topmost active layer fire — see {@link ShortcutLayer}.
   */
  layer: number;
}

interface ShortcutContextValue {
  /** Register a shortcut. Returns an unregister function. */
  register: (entry: ShortcutEntry) => () => void;
  /** Mark a layer depth as active (an overlay is mounted). Returns a release function. */
  pushLayer: (depth: number) => () => void;
  /** All currently registered shortcuts (for help dialogs, Kbd hints, etc.) */
  shortcuts: ShortcutEntry[];
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

/**
 * Lexical nesting depth. Read during render (never in an effect) so that a
 * shortcut inside an overlay always sees its own depth: React runs child
 * effects before parent effects, so an effect-based counter would register
 * child shortcuts at the parent's depth.
 */
const ShortcutLayerContext = createContext(0);

export function useShortcutContext() {
  const ctx = useContext(ShortcutContext);
  if (!ctx) throw new Error("useShortcutContext must be used within ShortcutProvider");
  return ctx;
}

export function useShortcutLayerDepth() {
  return useContext(ShortcutLayerContext);
}

function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

interface ShortcutProviderProps {
  children: ReactNode;
}

interface Registry {
  entries: ReadonlyMap<string, ShortcutEntry>;
  // Multiset of active layer depths: two overlays can share a depth.
  layers: ReadonlyMap<number, number>;
}

export default function ShortcutProvider({ children }: ShortcutProviderProps) {
  // Replaced, never mutated, so the snapshot's identity says whether the registry changed.
  const [store] = useState(() => {
    let registry: Registry = { entries: new Map(), layers: new Map() };
    const listeners = new Set<() => void>();
    return {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      read: () => registry,
      update: (change: (current: Registry) => Registry) => {
        registry = change(registry);
        for (const listener of listeners) listener();
      },
    };
  });
  const { entries, layers } = useSyncExternalStore(store.subscribe, store.read);

  const register = useCallback(
    (entry: ShortcutEntry) => {
      // Keyed by layer + key so an overlay can rebind a key the base app owns
      // without destroying it (and without its cleanup deleting the wrong entry).
      const id = `${entry.layer}\0${entry.key}`;
      store.update((current) => ({
        ...current,
        entries: new Map(current.entries).set(id, entry),
      }));

      return () => {
        store.update((current) => {
          const next = new Map(current.entries);
          next.delete(id);
          return { ...current, entries: next };
        });
      };
    },
    [store],
  );

  const pushLayer = useCallback(
    (depth: number) => {
      store.update((current) => ({
        ...current,
        layers: new Map(current.layers).set(depth, (current.layers.get(depth) ?? 0) + 1),
      }));

      return () => {
        store.update((current) => {
          const next = new Map(current.layers);
          const count = (next.get(depth) ?? 1) - 1;
          if (count > 0) next.set(depth, count);
          else next.delete(depth);
          return { ...current, layers: next };
        });
      };
    },
    [store],
  );

  // Bind/rebind tinykeys whenever the registry changes
  useEffect(() => {
    const topLayer = Math.max(0, ...layers.keys());
    const bindings: Record<string, (e: KeyboardEvent) => void> = {};

    for (const entry of entries.values()) {
      // Only the topmost active layer is live; anything below is covered by an
      // overlay and must not fire.
      if (entry.layer !== topLayer) continue;

      bindings[entry.key] = (e: KeyboardEvent) => {
        // Suppress shortcuts when typing in inputs (unless explicitly allowed)
        if (!entry.allowInInput && isEditableElement(e.target)) return;
        if (entry.preventDefault !== false) e.preventDefault();
        entry.handler(e);
      };
    }

    return tinykeys(window, bindings);
  }, [entries, layers]);

  // Every registered shortcut, regardless of layer: this is the app's own
  // documentation (help dialog), not the set that happens to be live.
  const shortcuts = useMemo(() => Array.from(entries.values()), [entries]);
  const value = useMemo(
    () => ({ register, pushLayer, shortcuts }),
    [register, pushLayer, shortcuts],
  );

  return <ShortcutContext value={value}>{children}</ShortcutContext>;
}

interface ShortcutLayerProps {
  /** While true, shortcuts below this layer are muted. */
  active?: boolean;
  children: ReactNode;
}

/**
 * Marks its subtree as an overlay layer. While `active`, only shortcuts
 * registered inside it (or inside a deeper layer) fire; everything underneath
 * stays registered — and stays listed in the help dialog — but is muted.
 *
 * Wrap any modal-ish surface: route-driven sheets, dialogs, confirms.
 */
export function ShortcutLayer({ active = true, children }: ShortcutLayerProps) {
  const parentDepth = useContext(ShortcutLayerContext);
  const depth = active ? parentDepth + 1 : parentDepth;
  // Tolerates a missing provider: a layer only mutes shortcuts, and without a
  // provider there are none to mute. `useShortcut` still throws.
  const pushLayer = useContext(ShortcutContext)?.pushLayer;

  useEffect(() => {
    if (!active || !pushLayer) return;
    return pushLayer(depth);
  }, [active, depth, pushLayer]);

  return <ShortcutLayerContext value={depth}>{children}</ShortcutLayerContext>;
}
