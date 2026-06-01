import * as SecureStore from "expo-secure-store";
import type { LoginBundle } from "./session-persistence.types";

export type { LoginBundle };

// Provided by the React Native / Expo runtime; not in this package's tsconfig libs.
declare const __DEV__: boolean;
declare const process: { env: Record<string, string | undefined> };

const LOGIN_BUNDLE_KEY = "passmgr.login-bundle";

// Dev-only escape hatch: skip the biometric prompt so fast-refresh reloads
// restore instantly. Never enabled in a production build.
const SKIP_BIOMETRIC =
  typeof __DEV__ !== "undefined" && __DEV__ && process.env.EXPO_PUBLIC_PERSIST_NO_BIOMETRIC === "1";

function writeOptions(): SecureStore.SecureStoreOptions {
  return {
    // Item is readable only while the device has been unlocked at least once,
    // never migrates to a new device via backup.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    // Gate retrieval behind device biometric / passcode (Keychain access
    // control / Android Keystore user-authentication).
    requireAuthentication: !SKIP_BIOMETRIC,
    authenticationPrompt: "Unlock your vault",
  };
}

/**
 * On-device persistent login is available whenever secure storage is present.
 * The OS prompt itself enforces biometric/passcode at read time.
 */
export function isPersistentLoginAvailable(): boolean {
  return true;
}

export async function persistLoginBundle(bundle: LoginBundle): Promise<void> {
  await SecureStore.setItemAsync(LOGIN_BUNDLE_KEY, JSON.stringify(bundle), writeOptions());
}

/**
 * Reading triggers the OS biometric/passcode prompt. Returns the stored bundle,
 * or null if nothing is stored or the user cancelled / auth failed.
 */
export async function loadLoginBundle(): Promise<LoginBundle | null> {
  try {
    const raw = await SecureStore.getItemAsync(LOGIN_BUNDLE_KEY, writeOptions());
    if (!raw) return null;
    return JSON.parse(raw) as LoginBundle;
  } catch {
    // User cancelled the prompt or authentication failed — treat as no session.
    return null;
  }
}

export async function clearLoginBundle(): Promise<void> {
  await SecureStore.deleteItemAsync(LOGIN_BUNDLE_KEY);
}
