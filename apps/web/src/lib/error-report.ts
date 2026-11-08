import {
  type ClientErrorInput,
  describeError,
  type ErrorDescription,
  reportClientError,
} from "@repo/client";
import { toast } from "@repo/ui";

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";
const ERROR_ENVIRONMENT = { appVersion: APP_VERSION, platform: "web" };

export function describeWebError(err: unknown): ErrorDescription {
  return describeError(err, ERROR_ENVIRONMENT);
}

/** Counts the crash on the server (no message, no stack); see `reportClientError`. */
export function reportWebError(
  err: unknown,
  kind: ClientErrorInput["kind"],
  area: ClientErrorInput["area"],
) {
  reportClientError(err, { kind, area }, { platform: "web", appVersion: APP_VERSION });
}

export async function copyErrorDetails(details: string) {
  try {
    await navigator.clipboard.writeText(details);
    toast.success("Error details copied");
  } catch {
    toast.error("Couldn't copy the error details");
  }
}
