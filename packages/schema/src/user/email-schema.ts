import z from "zod";

/**
 * Emails are case-insensitive identifiers. They feed the OPAQUE
 * credential_identifier / client_identity, so every server input must see the
 * same normalized form the client used (see `normalizeEmail` in @repo/crypto).
 */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
