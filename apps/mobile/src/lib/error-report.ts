import { describeError, type ErrorDescription } from "@repo/client";
import Constants from "expo-constants";
import { Platform } from "react-native";

const ERROR_ENVIRONMENT = {
  appVersion: Constants.expoConfig?.version ?? "dev",
  platform: `${Platform.OS} ${Platform.Version}`,
};

export function describeNativeError(err: unknown): ErrorDescription {
  return describeError(err, ERROR_ENVIRONMENT);
}
