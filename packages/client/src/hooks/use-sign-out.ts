import { clearLoginBundle, secretsStore } from "@repo/store";
import { useState } from "react";
import { useStore } from "../providers/StoreProvider";
import { endServerSession } from "../util/end-server-session";
import { useTRPCClient } from "../util/trpc";
import { useLock } from "./use-lock";

/**
 * Sign out (ADR 0001 D2, linked profiles): end the server session and lock.
 * The local vault stays on the device; the next unlock signs in again. The
 * persisted mobile login is dropped, so reopening the app asks for the password.
 */
export function useSignOut() {
  const trpc = useTRPCClient();
  const lock = useLock();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (secretsStore.hasServerSession) await endServerSession(trpc);
    } finally {
      await clearLoginBundle();
      lock();
      setSigningOut(false);
    }
  }

  return { signOut, signingOut };
}

/**
 * Remove the vault from this device (ADR 0001 D2): end the server session
 * (best-effort), delete the local database, profile, persisted login and
 * biometric enrollment, and lock. For a `local` profile this deletes the only
 * copy: the UI must confirm it explicitly.
 */
export function useRemoveFromDevice() {
  const trpc = useTRPCClient();
  const { removeVault } = useStore();
  const lock = useLock();
  const [removing, setRemoving] = useState(false);

  async function removeFromDevice() {
    if (removing) return;
    setRemoving(true);
    try {
      if (secretsStore.hasServerSession) await endServerSession(trpc);
    } finally {
      // Lock first: it stops the sync, so nothing writes into the database
      // while it's being deleted.
      lock();
      await removeVault();
      setRemoving(false);
    }
  }

  return { removeFromDevice, removing };
}
