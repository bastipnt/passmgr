import { fromBase64, fromString } from "@repo/util";
import { z } from "zod";

const OPAQUE_SECRET_BYTES = 32;
const MIN_SERVER_KEY_BYTES = 32;
const DEFAULT_STORAGE_QUOTA_MB = 100;

function isBase64OfLength(bytes: number) {
  return (value: string) => {
    try {
      return fromBase64(value).length === bytes;
    } catch {
      return false;
    }
  };
}

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const opaqueSecret = z
  .string()
  .refine(
    isBase64OfLength(OPAQUE_SECRET_BYTES),
    `must be base64 of ${OPAQUE_SECRET_BYTES} bytes (bun apps/server/scripts/opaque-cf-bootstrap.ts)`,
  );

const envSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    OPAQUE_OPRF_SEED: opaqueSecret,
    OPAQUE_AKE_PRIVATE_KEY: opaqueSecret,
    // Used as raw UTF-8 bytes, never trimmed or decoded: any change to the string re-keys every email hash,
    // email-at-rest, TOTP and backup-code ciphertext. Unset, it used to key them with an empty, public key.
    OPAQUE_SERVER_SETUP: z
      .string()
      .refine((v) => v.trim() !== "" && fromString(v).length >= MIN_SERVER_KEY_BYTES, {
        message: `must be at least ${MIN_SERVER_KEY_BYTES} bytes of random (openssl rand -base64 32)`,
      }),
    PREFIX: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .regex(/^\/[^/]/, "must be a path like /trpc")
        .optional(),
    ),
    // Fastify >=5.12 no longer supports hop counts (it would silently trust nothing).
    TRUST_PROXY: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .refine(
          (v) => !/^\d+$/.test(v),
          "must list proxy IPs/CIDRs (e.g. loopback,uniquelocal), not a hop count",
        )
        .optional(),
    ),
    CORS_ORIGIN: z.string().optional(),
    STORAGE_QUOTA_MB: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({ error: "must be a positive number of megabytes" })
        .positive("must be a positive number of megabytes")
        .default(DEFAULT_STORAGE_QUOTA_MB),
    ),
  })
  .transform((env) => ({ ...env, production: env.NODE_ENV === "production" }))
  .superRefine((env, ctx) => {
    if (env.production && !env.PREFIX) {
      ctx.addIssue({
        code: "custom",
        path: ["PREFIX"],
        message: "is required in production (otherwise tRPC mounts next to /health and /metrics)",
      });
    }
  });

export type ServerEnv = z.output<typeof envSchema>;

export function parseServerEnv(env: Record<string, string | undefined>): ServerEnv {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid server configuration:\n  ${problems.join("\n  ")}`);
  }
  return result.data;
}

export const serverEnv = parseServerEnv(process.env);
