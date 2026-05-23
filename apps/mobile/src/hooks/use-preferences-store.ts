import { createMMKV } from "react-native-mmkv";
import type { PreferencesStore } from "@repo/client";

export function usePreferencesStore() {
  const storage = createMMKV({ id: "pass-mgr-prefs" });

  const preferencesStore: PreferencesStore = {
    get(key: string): string | null {
      return storage.getString(key) ?? null;
    },
    set(key: string, value: string): void {
      storage.set(key, value);
    },
    remove(key: string): void {
      storage.remove(key);
    },
  };

  return preferencesStore;
}
