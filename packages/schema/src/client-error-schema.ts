import z from "zod";

export const CLIENT_ERROR_KINDS = ["render", "rejection", "uncaught"] as const;
export const CLIENT_ERROR_AREAS = ["auth", "records", "settings", "app"] as const;
export const CLIENT_ERROR_PLATFORMS = ["web", "ios", "android"] as const;

export const CLIENT_ERROR_OTHER_VERSION = "other";
const RELEASE_VERSION = /^v?\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export function clientErrorVersion(appVersion: string): string {
  return RELEASE_VERSION.test(appVersion) ? appVersion : CLIENT_ERROR_OTHER_VERSION;
}

/**
 * A client crash counted by the server: fixed enums and a release tag, no free text.
 * Anything else is rejected, so no message, stack or identifier can reach the metrics.
 */
export const clientErrorInputSchema = z
  .object({
    kind: z.enum(CLIENT_ERROR_KINDS),
    area: z.enum(CLIENT_ERROR_AREAS),
    platform: z.enum(CLIENT_ERROR_PLATFORMS),
    version: z.union([z.literal(CLIENT_ERROR_OTHER_VERSION), z.string().regex(RELEASE_VERSION)]),
  })
  .strict();

export type ClientErrorInput = z.infer<typeof clientErrorInputSchema>;
