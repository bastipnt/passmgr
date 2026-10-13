import { authenticateBiometric, type BiometricKeyMaterial, wipe } from "@repo/crypto";
import { secretsStore } from "@repo/store";
import { useContext, useEffect, useRef } from "react";
import { DeviceLoginRejectedError, type PendingDeviceLogin, startDeviceLogin } from "../login";
import { SessionContext } from "../providers/SessionProvider";
import { useStore } from "../providers/StoreProvider";
import { useTRPCClient } from "../util/trpc";
import type { ConnectResult, useConnectServer } from "./use-connect-server";

/** Under the server's five minutes, so a prepared login is still there when it's used. */
const PREPARED_MAX_AGE_MS = 4 * 60_000;

export function hasDeviceLogin(
  material: BiometricKeyMaterial | null | undefined,
): material is BiometricKeyMaterial {
  return material?.biometricDeviceLogin !== undefined;
}

/**
 * Device logins (`startDeviceLogin`) for the biometric unlock. `prepare`
 * starts one ahead of the click: Safari only shows the WebAuthn prompt close
 * to the user's gesture, and a server round trip in between can lose it.
 * A credential the server refuses (revoked, expired) is forgotten on the
 * device, so the next password unlock offers enrolling again.
 */
export function useDeviceLogin() {
  const trpc = useTRPCClient();
  const store = useStore();
  const preparedRef = useRef<{
    credentialId: string;
    login: Promise<PendingDeviceLogin | undefined>;
  }>(undefined);

  function start(credentialId: string) {
    return startDeviceLogin(trpc, credentialId).catch((e: unknown) => {
      if (e instanceof DeviceLoginRejectedError) void forget();
      else console.error("Starting the device login failed", e);
      return undefined;
    });
  }

  function prepare(credentialId: string) {
    drop();
    preparedRef.current = { credentialId, login: start(credentialId) };
  }

  function drop() {
    const prepared = preparedRef.current;
    preparedRef.current = undefined;
    void prepared?.login.then((login) => login?.discard());
  }

  /** The prepared login when fresh, else a new one. Undefined when the server can't start one. */
  async function take(credentialId: string): Promise<PendingDeviceLogin | undefined> {
    const prepared = preparedRef.current;
    preparedRef.current = undefined;
    const login = prepared?.credentialId === credentialId ? await prepared.login : undefined;
    if (login && Date.now() - login.startedAt < PREPARED_MAX_AGE_MS) return login;
    login?.discard();
    return await start(credentialId);
  }

  /** After the connect: a refused device login drops the dead enrollment. */
  function settle(login: PendingDeviceLogin, result: ConnectResult) {
    login.discard();
    if (result === "rejected") void forget();
    return result;
  }

  async function forget() {
    try {
      await store.forgetQuickUnlock();
    } catch (e) {
      console.error("Removing the biometric unlock failed", e);
    }
  }

  return { prepare, drop, take, settle };
}

/**
 * Reattach server auth through the biometric prompt alone (an unlocked
 * `offline` vault, no password in memory). The account key the prompt also
 * opens isn't needed: it's wiped.
 */
export async function reconnectWithDevice(
  material: BiometricKeyMaterial,
  deviceLogin: ReturnType<typeof useDeviceLogin>,
  connectWithDevice: ReturnType<typeof useConnectServer>["connectWithDevice"],
): Promise<ConnectResult> {
  const login = await deviceLogin.take(material.credentialId);
  if (!login) return "unreachable";
  try {
    const { accountKey, assertion } = await authenticateBiometric(material, login.challenge);
    wipe(accountKey);
    if (!assertion) return "unreachable";
    const result = await connectWithDevice((session, email, ask) =>
      login.finish(assertion, session, email, ask),
    );
    return deviceLogin.settle(login, result);
  } finally {
    login.discard();
  }
}

// App-wide, like the connect: the hook is mounted in more than one route tree.
let linkedFor: string | undefined;

/**
 * Once online after a password login, note this device's credential on the
 * session (`user.linkDeviceCredential`): revoking the session then removes it,
 * signing out the others keeps it, and it counts as a recent password login
 * for the credential. Mounted in the unlocked tree.
 */
export function useLinkDeviceCredential() {
  const { mode } = useContext(SessionContext);
  const store = useStore();
  const trpc = useTRPCClient();
  const material = store.biometricKeyMaterial;
  const credentialId = hasDeviceLogin(material) ? material.credentialId : undefined;

  useEffect(() => {
    if (mode !== "online" || !credentialId) return;
    const key = `${secretsStore.sessionId}:${credentialId}`;
    if (linkedFor === key) return;
    linkedFor = key;
    trpc.user.linkDeviceCredential.mutate({ credentialId }).catch((e: unknown) => {
      console.error("Linking the device credential failed", e);
    });
  }, [mode, credentialId, trpc]);
}
