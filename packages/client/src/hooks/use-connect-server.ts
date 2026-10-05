import type { VaultUnlockInfo } from "@repo/schema";
import { sameVaults, secretsStore } from "@repo/store";
import { useContext, useRef } from "react";
import { rekeyIfParamsStale } from "../account/rekey-password-keys";
import {
  type LoginSessionFn,
  LoginThrottledError,
  loginUser,
  OpaqueLoginFailedError,
} from "../login";
import { SessionContext } from "../providers/SessionProvider";
import { reloadVaultKeys, useStore } from "../providers/StoreProvider";
import { persistSession } from "../util/persist-session";
import { useTRPCClient } from "../util/trpc";

/**
 * - `online`: server auth is attached
 * - `rejected`: the server refused the password, or the account behind the
 *   email isn't this vault's. Retrying with the same password won't help.
 * - `throttled`: too many login attempts, retry later
 * - `unreachable`: network or server error, retry later
 * - `cancelled`: the vault was locked (or isn't linked) before it finished
 */
export type ConnectResult = "online" | "rejected" | "throttled" | "unreachable" | "cancelled";

/**
 * Whether the password kept in memory for reconnecting can go: it got us
 * online, or it never will. Biometric enrollment still needs it.
 */
export function canReleasePassword(result: ConnectResult, needsBiometricEnroll: boolean) {
  return (result === "online" || result === "rejected") && !needsBiometricEnroll;
}

// One connect at a time, app-wide: the unlock and `useAutoReconnect` can both
// try right after an unlock, and a second OPAQUE login would only race the
// first (and count twice against the login throttle). Keyed by the lock
// epoch, so an unlock after a lock never joins a connect of the previous one.
let inFlight: { epoch: number; result: Promise<ConnectResult> } | null = null;

type SessionParams = Parameters<LoginSessionFn>;

/**
 * Attach server auth to an already unlocked, linked vault (ADR 0001 D2):
 * `offline` → `online`. Runs the OPAQUE login for the profile's email and only
 * attaches the new session once it is known to be this vault's account and
 * the vault is still unlocked: an attached session makes the mode `online`,
 * which starts a sync, and a sync with another account's session would
 * replace this vault's data with that account's. The vault stays unlocked
 * whatever happens here.
 */
export function useConnectServer() {
  const { attachServer } = useContext(SessionContext);
  const store = useStore();
  const trpc = useTRPCClient();
  // The caller may hold an older render's `connect` (effects, promises).
  const storeRef = useRef(store);
  storeRef.current = store;

  /** Never throws. */
  function connect(password: string): Promise<ConnectResult> {
    const epoch = secretsStore.lockEpoch;
    if (inFlight?.epoch !== epoch) {
      const result = attach(password, epoch).finally(() => {
        if (inFlight?.result === result) inFlight = null;
      });
      inFlight = { epoch, result };
    }
    return inFlight.result;
  }

  /** Whether the unlock this connect was started for is still there. */
  function stillUnlocked(epoch: number) {
    return secretsStore.lockEpoch === epoch && secretsStore.isVaultUnlocked;
  }

  async function attach(password: string, epoch: number): Promise<ConnectResult> {
    if (!stillUnlocked(epoch)) return "cancelled";
    if (secretsStore.hasServerSession) return "online";
    const { profile, vault, saveAccount } = storeRef.current;
    if (profile?.mode !== "linked") return "cancelled";

    // Hold the session back until it's checked. A session that is never
    // attached is never used, and dies via its TTL.
    let session: SessionParams | undefined;
    let info: VaultUnlockInfo;
    try {
      info = await loginUser(
        trpc,
        async (...params) => {
          session = params;
        },
        profile.email,
        password,
      );
    } catch (e) {
      if (e instanceof OpaqueLoginFailedError) return "rejected";
      if (e instanceof LoginThrottledError) return "throttled";
      return "unreachable";
    }
    if (!session) return "unreachable";

    // The email now belongs to another account (e.g. re-registered after a
    // server reset). Its keys and data must never meet this vault's.
    if (info.userId !== profile.userId) {
      console.error("The server account no longer matches this device's vault");
      return "rejected";
    }
    // Re-check: the vault may have been locked during the login.
    if (!stillUnlocked(epoch)) return "cancelled";

    try {
      const material = { ...info.userPasswordKeys, userKeyPair: info.userKeyPair };
      const cachedVaults = await vault.getVaults();
      await saveAccount(material, info.vaultKeys);
      if (!stillUnlocked(epoch)) return "cancelled";
      if (!sameVaults(cachedVaults, info.vaultKeys)) reloadVaultKeys(info.vaultKeys);

      await attachServer(...session);
    } catch (e) {
      console.error("Connecting to the server failed", e);
      return "unreachable";
    }

    await persistSession();
    void rekeyAfterConnect(password, info);
    return "online";
  }

  /** Best-effort, see `rekeyIfParamsStale`; never turns a connect into a failure. */
  async function rekeyAfterConnect(password: string, info: VaultUnlockInfo) {
    try {
      const rekeyed = await rekeyIfParamsStale(trpc, password, {
        ...info.userPasswordKeys,
        userKeyPair: info.userKeyPair,
      });
      if (rekeyed) await storeRef.current.saveAccount(rekeyed, info.vaultKeys);
    } catch (e) {
      console.error("Storing the rekeyed password wrap failed", e);
    }
  }

  return { connect };
}
