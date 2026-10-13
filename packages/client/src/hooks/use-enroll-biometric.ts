import { type BiometricKeyMaterial, enrollBiometric, wipe } from "@repo/crypto";
import { secretsStore } from "@repo/store";
import { canEnrollBiometric, requireActive, useStore } from "../providers/StoreProvider";
import { profileLabel } from "../util/profile-label";
import { useTRPCClient } from "../util/trpc";
import { useConnectServer } from "./use-connect-server";

/**
 * Enroll the biometric unlock of the active profile (web, WebAuthn PRF). A
 * linked profile registers the credential with the server, which needs a
 * fresh password login: enrollment follows the unlock. Throws when it fails.
 */
export function useEnrollBiometric() {
  const store = useStore();
  const trpc = useTRPCClient();
  const { connect } = useConnectServer();

  async function enroll() {
    const active = requireActive(store);
    if (!canEnrollBiometric(active.profile)) throw new Error("Biometric enrollment unavailable");
    const linked = active.profile?.mode === "linked";
    if (linked) await ensureOnline();

    const accountKey = secretsStore.exportAccountKey();
    let enrolled: Awaited<ReturnType<typeof enrollBiometric>>;
    try {
      enrolled = await enrollBiometric(accountKey, {
        rpName: "passmgr",
        userName: profileLabel(active.entry),
      });
    } finally {
      wipe(accountKey);
    }

    let material: BiometricKeyMaterial = enrolled.material;
    if (linked) {
      if (!enrolled.devicePublicKey) throw new Error("The browser didn't hand out the public key");
      await trpc.user.registerDeviceCredential.mutate({
        credentialId: material.credentialId,
        ...enrolled.devicePublicKey,
      });
      material = { ...material, biometricDeviceLogin: "1" };
    }
    await store.saveBiometricKeyMaterial(material);
    secretsStore.clearOpaquePassword();
  }

  async function ensureOnline() {
    if (secretsStore.hasServerSession) return;
    const opaquePassword = secretsStore.copyOpaquePassword();
    if (!opaquePassword) throw new Error("No way to reach the server");
    // Kept until the enrollment is done: a cancelled prompt may be retried.
    const result = await connect(opaquePassword);
    if (result !== "online") throw new Error(`Connecting failed: ${result}`);
  }

  function dismiss() {
    secretsStore.clearOpaquePassword();
    store.setBiometricDismissed(true);
  }

  return { enroll, dismiss };
}
