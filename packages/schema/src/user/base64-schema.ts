import { decodeCanonicalBase64 } from "@repo/util";
import z from "zod";

/**
 * Base64 in the one spelling `toBase64` writes: decoders ignore the unused low bits of the last
 * digit, so without this one key or message would pass in several spellings.
 */
export function canonicalBase64() {
  return z
    .string()
    .refine((s) => decodeCanonicalBase64(s) !== undefined, "must be canonical base64");
}
