import { useMemo } from "react";
import { createMMKV } from "react-native-mmkv";
import type { PreferencesStore } from "@repo/client";

export function usePreferencesStore() {
  return useMemo<PreferencesStore>(() => {
    const storage = createMMKV({ id: "pass-mgr-prefs" });

    return {
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
  }, []);
}
