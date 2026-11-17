import { isReleaseVersion } from "@repo/schema";
import { fromBase64, fromString } from "@repo/util";
import { z } from "zod";

const OPAQUE_SECRET_BYTES = 32;
const MIN_SERVER_KEY_BYTES = 32;
const DEFAULT_STORAGE_QUOTA_MB = 100;
const DEFAULT_KEY_SET_RETENTION_DAYS = 14;
const MAX_KEY_SET_RETENTION_DAYS = 3650;
const DEFAULT_MAILS_PER_HOUR = 500;
const DEFAULT_MAILS_PER_DOMAIN_PER_HOUR = 50;

const mailsPerHour = (fallback: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: "must be a positive whole number of mails" })
      .int("must be a positive whole number of mails")
      .positive("must be a positive whole number of mails")
      .default(fallback),
  );

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

const port = (fallback: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: "must be a port number" })
      .int("must be a port number")
      .min(1, "must be a port number")
      .max(65_535, "must be a port number")
      .default(fallback),
  );

const releaseVersion = z
  .string()
  .trim()
  .refine(isReleaseVersion, "must be a release version like v1.2.3");

const normalizeVersion = (version: string) => version.replace(/^v/, "");

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
    HOST: z.preprocess(blankToUndefined, z.string().trim().default("0.0.0.0")),
    PORT: port(3000),
    // /health and /metrics listen here, never on PORT.
    OPS_HOST: z.preprocess(blankToUndefined, z.string().trim().optional()),
    OPS_PORT: port(3001),
    // The server's own release (set by the image build; a tag that isn't one,
    // like v1.4.0-rc.1, is ignored rather than failing startup). It and
    // CLIENT_VERSIONS are the only versions `clientError.report` labels as themselves.
    APP_VERSION: z.string().optional(),
    CLIENT_VERSIONS: z.preprocess(
      (value) =>
        typeof value === "string"
          ? value
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean)
          : value,
      z.array(releaseVersion).default([]),
    ),
    STORAGE_QUOTA_MB: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({ error: "must be a positive number of megabytes" })
        .positive("must be a positive number of megabytes")
        .default(DEFAULT_STORAGE_QUOTA_MB),
    ),
    KEY_SET_RETENTION_DAYS: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({ error: "must be a whole number of days" })
        .int("must be a whole number of days")
        .nonnegative("must be a whole number of days")
        .max(MAX_KEY_SET_RETENTION_DAYS, `must be at most ${MAX_KEY_SET_RETENTION_DAYS} days`)
        .default(DEFAULT_KEY_SET_RETENTION_DAYS),
    ),
    MAILS_PER_HOUR: mailsPerHour(DEFAULT_MAILS_PER_HOUR),
    MAILS_PER_DOMAIN_PER_HOUR: mailsPerHour(DEFAULT_MAILS_PER_DOMAIN_PER_HOUR),
  })
  .transform(({ APP_VERSION, CLIENT_VERSIONS, ...env }) => ({
    ...env,
    OPS_HOST: env.OPS_HOST ?? env.HOST,
    production: env.NODE_ENV === "production",
    clientVersions: new Set(
      [
        ...(APP_VERSION && isReleaseVersion(APP_VERSION.trim()) ? [APP_VERSION.trim()] : []),
        ...CLIENT_VERSIONS,
      ].map(normalizeVersion),
    ),
  }))
  .superRefine((env, ctx) => {
    if (env.production && !env.PREFIX) {
      ctx.addIssue({
        code: "custom",
        path: ["PREFIX"],
        message: "is required in production (the web proxy forwards only that path)",
      });
    }
    if (env.PORT === env.OPS_PORT) {
      ctx.addIssue({ code: "custom", path: ["OPS_PORT"], message: "must differ from PORT" });
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
