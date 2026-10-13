import {
  clearAutofillEntries,
  clearLoginBundle,
  logAutofillClearError,
  secretsStore,
} from "@repo/store";
import { useState } from "react";
import { useStore } from "../providers/StoreProvider";
import { endServerSession } from "../util/end-server-session";
import { useTRPCClient } from "../util/trpc";
import { hasDeviceLogin } from "./use-device-login";
import { useLock } from "./use-lock";

/**
 * Sign out (ADR 0001 D2, linked profiles): end the server session and lock.
 * The local vault stays on the device; the next unlock signs in again. The
 * persisted mobile login and autofill entries are dropped, so reopening the app asks
 * for the password.
 */
export function useSignOut() {
  const trpc = useTRPCClient();
  const store = useStore();
  const lock = useLock();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (secretsStore.hasServerSession) await endServerSession(trpc);
    } finally {
      const profileId = store.current()?.entry.profileId;
      if (profileId) await clearLoginBundle(profileId);
      lock();
      // After the lock: an unlocked tree would write the entries again on its next sync.
      if (profileId) await clearAutofillEntries(profileId).catch(logAutofillClearError);
      setSigningOut(false);
    }
  }

  return { signOut, signingOut };
}

/**
 * Remove a profile from this device (ADR 0001 D2), by default the active
 * (unlocked) one: end its server session (best-effort), lock, and delete its
 * database, persisted login and biometric enrollment. Other profiles stay.
 * `removeAll` removes every profile. For a `local` profile this deletes the
 * only copy: the UI must confirm it explicitly.
 */
export function useRemoveFromDevice() {
  const trpc = useTRPCClient();
  const store = useStore();
  const lock = useLock();
  const [removing, setRemoving] = useState(false);

  async function remove(action: () => Promise<void>, removesActive: boolean) {
    if (removing) return;
    setRemoving(true);
    try {
      if (secretsStore.hasServerSession) {
        if (removesActive) await forgetDeviceCredential();
        await endServerSession(trpc);
      }
    } finally {
      try {
        // Lock first: it stops the sync, so nothing writes into the database
        // while it's being deleted.
        lock();
        await action();
      } finally {
        setRemoving(false);
      }
    }
  }

  /**
   * The active profile's biometric login goes with its database: the server
   * forgets it too (best-effort; only the active profile's session can ask).
   */
  async function forgetDeviceCredential() {
    const material = store.current()?.biometricKeyMaterial;
    if (!hasDeviceLogin(material)) return;
    try {
      await trpc.user.removeDeviceCredential.mutate({ credentialId: material.credentialId });
    } catch (e) {
      console.error("Removing the device credential failed", e);
    }
  }

  async function removeFromDevice(profileId = store.current()?.entry.profileId) {
    if (profileId)
      await remove(
        () => store.removeProfile(profileId),
        profileId === store.current()?.entry.profileId,
      );
  }

  async function removeAll() {
    await remove(() => store.removeAllProfiles(), true);
  }

  return { removeFromDevice, removeAll, removing };
}
