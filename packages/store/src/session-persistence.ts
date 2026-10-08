import type { LoginBundle } from "./session-persistence.types";

export type { LoginBundle };

/**
 * Default (web) implementation: persistent login is intentionally a no-op.
 *
 * Persisting `authKey`/`vaultKey` in browser storage would expose them to XSS
 * token/key theft, so on web the session stays in-memory only. Metro resolves
 * `./session-persistence.native` on iOS/Android, where the real secure-store
 * implementation lives.
 */
export function isPersistentLoginAvailable(): boolean {
  return false;
}

export async function persistLoginBundle(_profileId: string, _bundle: LoginBundle): Promise<void> {
  // no-op on web
}

export async function loadLoginBundle(_profileId: string): Promise<LoginBundle | null> {
  return null;
}

export async function clearLoginBundle(_profileId: string): Promise<void> {
  // no-op on web
}
