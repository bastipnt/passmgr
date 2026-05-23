# @repo/crypto

All cryptographic primitives for [passmgr](../../README.md). If it touches keys, ciphers, hashes, or randomness, it lives here.

## Consumers

- `apps/web`
- `apps/server`
- `apps/mobile` (via `@repo/client`)

## What's in here

- **OPAQUE** wrappers around `@cloudflare/opaque-ts` (client + server sides of registration / login).
- **Symmetric encryption**: XChaCha20-Poly1305 via `@noble/ciphers`.
- **Hashing / KDFs**: HKDF, Argon2id, HMAC-SHA256 via `@noble/hashes`.
- **TOTP** generation and verification.
- **Key hierarchy helpers** for deriving `passwordKEK`, `recoveryKEK`, `sessionSecret`, `authKey`.

## Conventions

- Use only well-reviewed primitives from `@noble/*` and `@cloudflare/opaque-ts`. Do **not** add hand-rolled crypto here.
- Any change to this package needs careful review — it's the keystone of the whole project. Add tests for new code (the Stryker mutation suite covers this package).
- Wipe key buffers when you're done with them (`buf.fill(0)`).

## Tests

```bash
pnpm --filter @repo/crypto test
pnpm stryker:crypto   # mutation testing (from repo root)
```
