import type { PreferencesStore } from "@repo/client";
import { safeLocalStorage } from "@repo/ui/lib/safe-local-storage";

const preferencesStore: PreferencesStore = safeLocalStorage;

export function usePreferencesStore(): PreferencesStore {
  return preferencesStore;
}
