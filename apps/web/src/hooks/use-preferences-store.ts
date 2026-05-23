import { type PreferencesStore } from "@repo/client";

export function usePreferencesStore() {
  const preferencesStore: PreferencesStore = {
    get(key: string): string | null {
      return localStorage.getItem(key);
    },
    set(key: string, value: string): void {
      localStorage.setItem(key, value);
    },
    remove(key: string): void {
      localStorage.removeItem(key);
    },
  };

  return preferencesStore;
}
