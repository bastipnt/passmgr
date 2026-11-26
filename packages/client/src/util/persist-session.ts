import { isPersistentLoginAvailable, persistLoginBundle, secretsStore } from "@repo/store";
import { logError } from "@repo/util";

/**
 * Persist the unlocked profile's account key (and the server session, if one is attached) to OS
 * secure storage (mobile only — no-op on web), so the next app launch can
 * restore the unlocked vault behind a single biometric prompt, skipping Argon2
 * (and OPAQUE). Re-run whenever the server session is attached or dropped.
 * Best-effort: failures never block the caller. `withoutServer` leaves the attached session out.
 */
export async function persistSession(
  profileId: string | undefined,
  { withoutServer = false }: { withoutServer?: boolean } = {},
) {
  if (!profileId || !isPersistentLoginAvailable() || !secretsStore.isVaultUnlocked) return;

  try {
    const bundle = secretsStore.exportPersistableBundle();
    if (withoutServer) delete bundle.server;
    await persistLoginBundle(profileId, bundle);
  } catch (e) {
    logError("Persisting session for fast unlock failed", e);
  }
}
