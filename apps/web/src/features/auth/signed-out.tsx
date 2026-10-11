import { LogOutIcon } from "lucide-react";
import { useEffect, useState } from "react";
import AuthNote from "./AuthNote";

const SIGNED_OUT_KEY = "passmgr:signed-out";

export const SIGNED_OUT_MESSAGE =
  "You were signed out from another device. Changes that hadn't synced stay on this device and sync after you sign in again.";

/**
 * Another device signed this one out, or the password changed elsewhere
 * (`StoreProvider`'s `onSignedOut`, after the lock). Keys live in memory only,
 * so reload like a lock; the note survives the reload in sessionStorage.
 */
export function onSignedOutElsewhere() {
  try {
    sessionStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {
    // No storage: the reload still locks, just without the note.
  }
  window.location.reload();
}

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Shown once on the unlock after a sign-out from elsewhere. */
export function SignedOutNote() {
  const [signedOut] = useState(readFlag);
  useEffect(() => {
    try {
      sessionStorage.removeItem(SIGNED_OUT_KEY);
    } catch {
      // Nothing to clear.
    }
  }, []);

  if (!signedOut) return null;
  return (
    <output className="block">
      <AuthNote icon={<LogOutIcon className="text-[#ffb23f]" />}>{SIGNED_OUT_MESSAGE}</AuthNote>
    </output>
  );
}
