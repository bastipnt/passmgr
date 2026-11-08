import { describeError, type ErrorDescription } from "@repo/client";
import { toast } from "@repo/ui";

const ERROR_ENVIRONMENT = {
  appVersion: import.meta.env.VITE_APP_VERSION ?? "dev",
  platform: "web",
};

export function describeWebError(err: unknown): ErrorDescription {
  return describeError(err, ERROR_ENVIRONMENT);
}

export async function copyErrorDetails(details: string) {
  try {
    await navigator.clipboard.writeText(details);
    toast.success("Error details copied");
  } catch {
    toast.error("Couldn't copy the error details");
  }
}
