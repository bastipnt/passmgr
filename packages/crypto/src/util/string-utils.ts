export function normalize(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Canonical email form. Must be applied before every OPAQUE call — the email is
 * the credential_identifier and client_identity, so `Foo@x.com` and `foo@x.com`
 * would otherwise derive different OPRF keys and MAC transcripts.
 */
export function normalizeEmail(email: string): string {
  return normalize(email);
}
