import { decodeCanonicalBase64 } from "@repo/util";
import z from "zod";

/**
 * A serialized OPAQUE message (base64; P-256 messages are a few hundred bytes). Canonical only,
 * so a message has one spelling, like the signature header (`decodeCanonicalBase64`).
 */
export const opaqueMessageSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((s) => decodeCanonicalBase64(s) !== undefined, "must be canonical base64");
