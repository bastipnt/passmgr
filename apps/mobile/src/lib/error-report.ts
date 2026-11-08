import {
  type ClientErrorInput,
  describeError,
  type ErrorDescription,
  reportClientError,
} from "@repo/client";
import Constants from "expo-constants";
import { Platform } from "react-native";

const APP_VERSION = Constants.expoConfig?.version ?? "dev";
const ERROR_ENVIRONMENT = {
  appVersion: APP_VERSION,
  platform: `${Platform.OS} ${Platform.Version}`,
};

export function describeNativeError(err: unknown): ErrorDescription {
  return describeError(err, ERROR_ENVIRONMENT);
}

/** Counts the crash on the server (no message, no stack); see `reportClientError`. */
export function reportNativeError(
  err: unknown,
  kind: ClientErrorInput["kind"],
  area: ClientErrorInput["area"],
) {
  reportClientError(
    err,
    { kind, area },
    { platform: Platform.OS === "android" ? "android" : "ios", appVersion: APP_VERSION },
  );
}
