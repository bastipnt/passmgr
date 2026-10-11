import { Platform } from "react-native";

/**
 * How this phone is named in the account's session list: platform and system
 * only. Not `Constants.deviceName`: the name the user gave the phone often
 * holds their real name, and the server would keep it in plaintext.
 */
export function deviceName(): string {
  if (Platform.OS === "ios") return `iPhone (iOS ${Platform.Version})`;
  const release = (Platform.constants as { Release?: string }).Release ?? Platform.Version;
  return `Android (Android ${release})`;
}
