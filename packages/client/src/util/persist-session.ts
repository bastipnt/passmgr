import { isPersistentLoginAvailable, persistLoginBundle, secretsStore } from "@repo/store";

/**
 * Persist the unlocked profile's account key (and the server session, if one is attached) to OS
 * secure storage (mobile only — no-op on web), so the next app launch can
 * restore the unlocked vault behind a single biometric prompt, skipping Argon2
 * (and OPAQUE). Re-run whenever the server session is attached or dropped.
 * Best-effort: failures never block the caller.
 */
export async function persistSession(profileId: string | undefined) {
  if (!profileId || !isPersistentLoginAvailable() || !secretsStore.isVaultUnlocked) return;

  try {
    await persistLoginBundle(profileId, secretsStore.exportPersistableBundle());
  } catch (e) {
    console.error("Persisting session for fast unlock failed", e);
  }
}
