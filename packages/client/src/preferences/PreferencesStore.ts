/**
 * Synchronous key-value store for non-sensitive app preferences
 * (sort order, theme, dismiss flags). Web impl wraps `localStorage`;
 * mobile impl wraps `react-native-mmkv`.
 */
export interface PreferencesStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
