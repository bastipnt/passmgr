import { deriveOpaquePassword, wipe } from "@repo/crypto";
import { sameVaults, secretsStore } from "@repo/store";
import { useContext, useRef } from "react";
import { rekeyIfParamsStale } from "../account/rekey-password-keys";
import {
  type AccountLogin,
  type LoginSessionFn,
  LoginThrottledError,
  loginWithOpaquePassword,
  OpaqueLoginFailedError,
  SecondFactorCancelledError,
  SecondFactorExpiredError,
  type SecondFactorPrompt,
} from "../login";
import { useSecondFactorPrompt } from "../providers/SecondFactorPromptProvider";
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
 * - `second_factor`: the account has two-factor on and the code prompt was
 *   closed (or ran out); connect again to be asked again
 */
export type ConnectResult =
  | "online"
  | "rejected"
  | "throttled"
  | "unreachable"
  | "cancelled"
  | "second_factor";

/**
 * Whether the OPAQUE password kept in memory for reconnecting can go: it got
 * us online, or it never will. Biometric enrollment still needs it.
 */
export function canReleaseOpaquePassword(result: ConnectResult, needsBiometricEnroll: boolean) {
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
/**
 * `onSecondFactor`: how a login with two-factor on asks for the code
 * (default: the app's `SecondFactorPromptProvider`).
 */
export function useConnectServer(onSecondFactor?: SecondFactorPrompt) {
  const { attachServer } = useContext(SessionContext);
  const store = useStore();
  const trpc = useTRPCClient();
  const contextPrompt = useSecondFactorPrompt();
  const prompt = onSecondFactor ?? contextPrompt;
  // The caller may hold an older render's `connect` (effects, promises).
  const storeRef = useRef(store);
  storeRef.current = store;

  /**
   * `credential`: the password as typed, or an OPAQUE password
   * (`deriveOpaquePassword`), which `connect` takes over and wipes. Only the
   * typed password can move the password wrap to new Argon2 params.
   * Never throws.
   */
  function connect(credential: string | Uint8Array): Promise<ConnectResult> {
    const epoch = secretsStore.lockEpoch;
    if (inFlight?.epoch !== epoch) {
      const result = attach(credential, epoch).finally(() => {
        if (inFlight?.result === result) inFlight = null;
      });
      inFlight = { epoch, result };
    } else if (credential instanceof Uint8Array) wipe(credential);
    return inFlight.result;
  }

  /** Whether the unlock this connect was started for is still there. */
  function stillUnlocked(epoch: number) {
    return secretsStore.lockEpoch === epoch && secretsStore.isVaultUnlocked;
  }

  async function attach(credential: string | Uint8Array, epoch: number): Promise<ConnectResult> {
    try {
      return await attachWith(credential, epoch);
    } finally {
      if (credential instanceof Uint8Array) wipe(credential);
    }
  }

  async function attachWith(
    credential: string | Uint8Array,
    epoch: number,
  ): Promise<ConnectResult> {
    if (!stillUnlocked(epoch)) return "cancelled";
    if (secretsStore.hasServerSession) return "online";
    // The profile that is unlocked now: switching profiles locks first.
    const active = storeRef.current.current();
    const profile = active?.profile;
    if (!active || profile?.mode !== "linked") return "cancelled";
    const { profileId } = active.entry;

    // Hold the session back until it's checked. A session that is never
    // attached is never used, and dies via its TTL.
    let session: SessionParams | undefined;
    let info: AccountLogin;
    const opaquePassword =
      typeof credential === "string"
        ? await deriveOpaquePassword(credential, profile.email)
        : credential;
    try {
      info = await loginWithOpaquePassword(
        trpc,
        async (...params) => {
          session = params;
        },
        profile.email,
        opaquePassword,
        prompt,
      );
    } catch (e) {
      if (e instanceof OpaqueLoginFailedError) return "rejected";
      if (e instanceof SecondFactorCancelledError || e instanceof SecondFactorExpiredError)
        return "second_factor";
      if (e instanceof LoginThrottledError) return "throttled";
      return "unreachable";
    } finally {
      wipe(opaquePassword);
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
      const cachedVaults = await active.vault.getVaults();
      await storeRef.current.saveAccount(profileId, material, info.vaultKeys);
      if (!stillUnlocked(epoch)) return "cancelled";
      if (!sameVaults(cachedVaults, info.vaultKeys)) reloadVaultKeys(info.vaultKeys);

      await attachServer(...session);
    } catch (e) {
      console.error("Connecting to the server failed", e);
      return "unreachable";
    }

    await persistSession(profileId);
    if (typeof credential === "string") void rekeyAfterConnect(profileId, credential, info);
    return "online";
  }

  /** Best-effort, see `rekeyIfParamsStale`; never turns a connect into a failure. */
  async function rekeyAfterConnect(profileId: string, password: string, info: AccountLogin) {
    try {
      const rekeyed = await rekeyIfParamsStale(trpc, password, {
        ...info.userPasswordKeys,
        userKeyPair: info.userKeyPair,
      });
      if (rekeyed) await storeRef.current.saveAccount(profileId, rekeyed, info.vaultKeys);
    } catch (e) {
      console.error("Storing the rekeyed password wrap failed", e);
    }
  }

  return { connect };
}
