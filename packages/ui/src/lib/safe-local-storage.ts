/**
 * `localStorage` that never throws: a browser that blocks storage (privacy
 * settings, some private windows) throws on access, and the theme is read before
 * the first render. Reads then give `null`, writes are dropped.
 */
export const safeLocalStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};
