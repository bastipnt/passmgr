import { deriveOpaquePassword, wipe } from "@repo/crypto";
import { sameVaults, secretsStore } from "@repo/store";
import { useContext, useRef } from "react";
import { rekeyIfBelowFloor } from "../account/rekey-password-keys";
import {
  type AccountLogin,
  DeviceLoginRejectedError,
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
 * - `rejected`: the server refused the password (or device credential), or the
 *   account behind the email isn't this vault's. Retrying with the same
 *   credential won't help.
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
 * us online, or it never will. Biometric enrollment still needs it to get online.
 */
export function canReleaseOpaquePassword(result: ConnectResult, needsBiometricEnroll: boolean) {
  return (result === "online" || result === "rejected") && !needsBiometricEnroll;
}

/** Logs in to the server for the profile's email, handing the session to `session`. */
export type ServerLogin = (
  session: LoginSessionFn,
  email: string,
  onSecondFactor: SecondFactorPrompt,
) => Promise<AccountLogin>;

// One connect at a time, app-wide: the unlock and `useAutoReconnect` can both
// try right after an unlock, and a second login would only race the first (and
// count twice against the login throttle). Keyed by the lock epoch, so an
// unlock after a lock never joins a connect of the previous one.
let inFlight: { epoch: number; result: Promise<ConnectResult> } | null = null;

type SessionParams = Parameters<LoginSessionFn>;

/**
 * Attach server auth to an already unlocked, linked vault (ADR 0001 D2):
 * `offline` → `online`. Logs in for the profile's email (OPAQUE, or the
 * device credential behind the biometric unlock) and only attaches the new
 * session once it is known to be this vault's account and the vault is still
 * unlocked: an attached session makes the mode `online`, which starts a sync,
 * and a sync with another account's session would replace this vault's data
 * with that account's. The vault stays unlocked whatever happens here.
 *
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
   * typed password can raise a password wrap below the Argon2 floor.
   * Never throws.
   */
  function connect(credential: string | Uint8Array): Promise<ConnectResult> {
    const joined = join((epoch) => attachPassword(credential, epoch));
    if (!joined.started && credential instanceof Uint8Array) wipe(credential);
    return joined.result;
  }

  /**
   * Attach with a device login whose assertion is already signed
   * (`PendingDeviceLogin.finish`). Joining a connect in flight leaves the
   * login unused: the caller discards it. Never throws.
   */
  function connectWithDevice(login: ServerLogin): Promise<ConnectResult> {
    return join(async (epoch) => (await attach(login, epoch)).result).result;
  }

  function join(start: (epoch: number) => Promise<ConnectResult>) {
    const epoch = secretsStore.lockEpoch;
    if (inFlight?.epoch === epoch) return { started: false, result: inFlight.result };
    const result = start(epoch).finally(() => {
      if (inFlight?.result === result) inFlight = null;
    });
    inFlight = { epoch, result };
    return { started: true, result };
  }

  /** Whether the unlock this connect was started for is still there. */
  function stillUnlocked(epoch: number) {
    return secretsStore.lockEpoch === epoch && secretsStore.isVaultUnlocked;
  }

  async function attachPassword(
    credential: string | Uint8Array,
    epoch: number,
  ): Promise<ConnectResult> {
    try {
      const { result, profileId, info } = await attach(async (session, email, ask) => {
        const opaquePassword =
          typeof credential === "string"
            ? await deriveOpaquePassword(credential, email)
            : credential;
        try {
          return await loginWithOpaquePassword(trpc, session, email, opaquePassword, ask);
        } finally {
          wipe(opaquePassword);
        }
      }, epoch);
      if (result === "online" && typeof credential === "string" && profileId && info)
        void rekeyAfterConnect(profileId, credential, info);
      return result;
    } finally {
      if (credential instanceof Uint8Array) wipe(credential);
    }
  }

  async function attach(
    login: ServerLogin,
    epoch: number,
  ): Promise<{ result: ConnectResult; profileId?: string; info?: AccountLogin }> {
    if (!stillUnlocked(epoch)) return { result: "cancelled" };
    if (secretsStore.hasServerSession) return { result: "online" };
    // The profile that is unlocked now: switching profiles locks first.
    const active = storeRef.current.current();
    const profile = active?.profile;
    if (!active || profile?.mode !== "linked") return { result: "cancelled" };
    const { profileId } = active.entry;

    // Hold the session back until it's checked. A session that is never
    // attached is never used, and dies via its TTL.
    let session: SessionParams | undefined;
    let info: AccountLogin;
    try {
      info = await login(
        async (...params) => {
          session = params;
        },
        profile.email,
        prompt,
      );
    } catch (e) {
      return { result: loginFailure(e) };
    }
    if (!session) return { result: "unreachable" };

    // The email now belongs to another account (e.g. re-registered after a
    // server reset). Its keys and data must never meet this vault's.
    if (info.userId !== profile.userId) {
      console.error("The server account no longer matches this device's vault");
      return { result: "rejected" };
    }
    // Re-check: the vault may have been locked during the login.
    if (!stillUnlocked(epoch)) return { result: "cancelled" };

    try {
      const material = { ...info.userPasswordKeys, userKeyPair: info.userKeyPair };
      const cachedVaults = await active.vault.getVaults();
      await storeRef.current.saveAccount(profileId, material, info.vaultKeys);
      if (!stillUnlocked(epoch)) return { result: "cancelled" };
      if (!sameVaults(cachedVaults, info.vaultKeys)) reloadVaultKeys(info.vaultKeys);

      await attachServer(...session);
    } catch (e) {
      console.error("Connecting to the server failed", e);
      return { result: "unreachable" };
    }

    await persistSession(profileId);
    return { result: "online", profileId, info };
  }

  /** Best-effort, see `rekeyIfBelowFloor`; never turns a connect into a failure. */
  async function rekeyAfterConnect(profileId: string, password: string, info: AccountLogin) {
    try {
      const rekeyed = await rekeyIfBelowFloor(trpc, password, {
        ...info.userPasswordKeys,
        userKeyPair: info.userKeyPair,
      });
      if (rekeyed) await storeRef.current.saveAccount(profileId, rekeyed, info.vaultKeys);
    } catch (e) {
      console.error("Storing the rekeyed password wrap failed", e);
    }
  }

  return { connect, connectWithDevice };
}

function loginFailure(e: unknown): ConnectResult {
  if (e instanceof OpaqueLoginFailedError || e instanceof DeviceLoginRejectedError)
    return "rejected";
  if (e instanceof SecondFactorCancelledError || e instanceof SecondFactorExpiredError)
    return "second_factor";
  if (e instanceof LoginThrottledError) return "throttled";
  return "unreachable";
}
