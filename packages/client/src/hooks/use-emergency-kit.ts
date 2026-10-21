import { normalizeEmail, wipe } from "@repo/crypto";
import { useCallback, useState } from "react";
import { createEmergencyKit, type EmergencyKitFile } from "../account/emergency-kit";
import { useServerUrl } from "../providers/ClientProvider";
import { absoluteServerUrl } from "../util/server-url";

export type EmergencyKitOptions = {
  /** The account's email; absent for a local vault (the kit then names no server). */
  email?: string;
  name?: string;
  appUrl?: string;
};

/**
 * - `saved`: handed over (downloaded, printed or shared)
 * - `cancelled`: the hand-over was closed without saving
 * - `failed`: the PDF couldn't be built
 */
export type EmergencyKitSaveResult = "saved" | "cancelled" | "failed";

/**
 * Saving a freshly issued recovery key in `RecoveryKeyDialog`: copied, or the
 * emergency kit PDF built on the device and handed over by the platform
 * (`handOff`: web downloads it, mobile opens the print sheet; `false` or a
 * throw = not saved). The server address is the one this client talks to.
 * `saved` gates "I saved it"; it stays off while a kit is built, since
 * confirming wipes the key.
 */
export function useEmergencyKit(recoveryKey: Uint8Array | null, options: EmergencyKitOptions) {
  const serverUrl = useServerUrl();
  const [copied, setCopied] = useState(false);
  const [kitSaved, setKitSaved] = useState(false);
  const [kitBusy, setKitBusy] = useState(false);
  const { email, name, appUrl } = options;

  const saveKit = useCallback(
    async (
      handOff: (kit: EmergencyKitFile) => boolean | Promise<boolean>,
    ): Promise<EmergencyKitSaveResult> => {
      if (!recoveryKey) return "failed";
      setKitBusy(true);
      try {
        let kit: EmergencyKitFile;
        try {
          kit = await createEmergencyKit({
            recoveryKey,
            // As the server stores it: what signing in or recovering matches.
            account: email
              ? { email: normalizeEmail(email), serverUrl: absoluteServerUrl(serverUrl) }
              : undefined,
            name: name || undefined,
            appUrl,
          });
        } catch {
          return "failed";
        }
        try {
          const handedOver = await handOff(kit);
          if (handedOver) setKitSaved(true);
          return handedOver ? "saved" : "cancelled";
        } catch {
          return "cancelled";
        } finally {
          // The platform took its own copy (Blob, data URI).
          wipe(kit.bytes);
        }
      } finally {
        setKitBusy(false);
      }
    },
    [recoveryKey, email, name, appUrl, serverUrl],
  );

  const markCopied = useCallback(() => setCopied(true), []);
  const reset = useCallback(() => {
    setCopied(false);
    setKitSaved(false);
  }, []);

  return {
    copied,
    markCopied,
    kitSaved,
    kitBusy,
    saved: (copied || kitSaved) && !kitBusy,
    saveKit,
    reset,
  };
}
