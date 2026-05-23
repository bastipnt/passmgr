# @repo/client

Shared client-side logic for [passmgr](../../README.md): auth hooks, the tRPC client, and the in-memory secrets store.

## Consumers

- `apps/web`
- `apps/mobile`

## What's in here

- **Auth hooks**: `useLogin`, `useRegistration`. Drive the OPAQUE flow end-to-end and hand session material off to the secrets store.
- **tRPC client**: configured with HMAC request signing. Every protected call gets `x-session-id`, `x-timestamp`, and an `x-signature` header derived from the session's `authKey`. See `apps/server/src/auth/authMiddleware.ts` for the server-side counterpart.
- **`secretsStore` (singleton)**: holds `sessionSecret`, `authKey`, `vaultKey`, and the recovery key material **in memory only**. Never persisted. Call `wipe()` on key buffers when you're done with them.

## OPAQUE flow (client side)

1. **Register** — `opaque.client.startRegistration` → server → `opaque.client.finishRegistration`. Locally derives `passwordKEK` (Argon2id), generates a `recoveryKey` client-side (server never sees it), and wraps `vaultKey` twice.
2. **Login** — `opaque.client.startLogin` → server → `opaque.client.finishLogin`. Derives `sessionKey`. `secretsStore.unlock()` then derives `sessionSecret` + `authKey` via HKDF and stores them in memory.

## Conventions

- Treat all key material as sensitive. Don't log it, don't put it in error messages, don't pass it across the tRPC boundary.
- The recovery key MUST NOT be transmitted to the server. There is a comment to this effect in `src/register.ts` — leave it there.
