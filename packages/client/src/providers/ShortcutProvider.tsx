import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { tinykeys } from "tinykeys";

// ── Types ──────────────────────────────────────────────────────────

export interface ShortcutEntry {
  /** tinykeys key binding string, e.g. "$mod+k" */
  key: string;
  /** Human-readable description shown in future help dialogs */
  description?: string;
  /** Handler invoked when the shortcut fires */
  handler: (e: KeyboardEvent) => void;
  /**
   * If true the shortcut fires even when an input/textarea/contenteditable
   * element is focused. Defaults to false.
   */
  allowInInput?: boolean;
}

interface ShortcutContextValue {
  /** Register a shortcut. Returns an unregister function. */
  register: (entry: ShortcutEntry) => () => void;
  /** All currently registered shortcuts (for help dialogs, Kbd hints, etc.) */
  shortcuts: ShortcutEntry[];
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

// ── Hook ───────────────────────────────────────────────────────────

export function useShortcutContext() {
  const ctx = useContext(ShortcutContext);
  if (!ctx) throw new Error("useShortcutContext must be used within ShortcutProvider");
  return ctx;
}

// ── Helpers ────────────────────────────────────────────────────────

function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

// ── Provider ───────────────────────────────────────────────────────

interface ShortcutProviderProps {
  children: ReactNode;
}

export default function ShortcutProvider({ children }: ShortcutProviderProps) {
  const entriesRef = useRef<Map<string, ShortcutEntry>>(new Map());
  const [revision, setRevision] = useState(0);

  const register = useCallback((entry: ShortcutEntry) => {
    entriesRef.current.set(entry.key, entry);
    setRevision((r) => r + 1);

    return () => {
      entriesRef.current.delete(entry.key);
      setRevision((r) => r + 1);
    };
  }, []);

  // Bind/rebind tinykeys whenever the registry changes
  useEffect(() => {
    const bindings: Record<string, (e: KeyboardEvent) => void> = {};

    for (const [key, entry] of entriesRef.current) {
      bindings[key] = (e: KeyboardEvent) => {
        // Suppress shortcuts when typing in inputs (unless explicitly allowed)
        if (!entry.allowInInput && isEditableElement(e.target)) return;
        e.preventDefault();
        entry.handler(e);
      };
    }

    const unsubscribe = tinykeys(window, bindings);
    return unsubscribe;
    // revision is used to trigger rebinding
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  const shortcuts = Array.from(entriesRef.current.values());

  return <ShortcutContext value={{ register, shortcuts }}>{children}</ShortcutContext>;
}
