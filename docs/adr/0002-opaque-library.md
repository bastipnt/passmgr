# ADR 0002 — OPAQUE library: `@cloudflare/opaque-ts`

- **Status:** Accepted
- **Date:** 2026-05-21 (written down 2026-11-19)
- **Tracking:** none; the switch is commit `3cffcae8`

## Context

Registration, login, password change and recovery all run OPAQUE (`docs/architecture/auth.md`), and the same
protocol code has to run in three places: the Bun server, the web app (Vite) and the mobile app (React Native on
Hermes). The first implementation used `@serenity-kit/opaque`. Its 0.8 and 1.x releases don't work together, and
that split caused mobile login failures.

## Decision

Use `@cloudflare/opaque-ts` on server and client (`apps/server/src/opaque.ts`, `packages/client`), with the
`OPAQUE_P256` configuration.

- It is pure TypeScript on `crypto.subtle`, with no WebAssembly to load, so one package runs on Bun, in the Vite build
  and in React Native, where `react-native-quick-crypto` provides `crypto.subtle` (installed in
  `apps/mobile/src/app/_layout.tsx`).
- The key stretching function is supplied by us: scrypt from `@repo/crypto/services/opaque-ksf` (on mobile the
  native scrypt of `react-native-quick-crypto`, same parameters).

Rejected alternative:

- Staying on `@serenity-kit/opaque` and pinning one release line on every platform: the version split was what
  broke mobile login.

## Consequences

- The wire format and the registration record encoding differ from `@serenity-kit/opaque` 1.x: registrations made
  before the switch stopped working and those accounts had to register again (acceptable with no real users yet, as
  in ADR 0001).
- The server's OPAQUE secrets are `OPAQUE_OPRF_SEED` and `OPAQUE_AKE_PRIVATE_KEY`, generated once with
  `apps/server/scripts/opaque-cf-bootstrap.ts`; changing either invalidates every registration (`docs/ops/deploy.md`).
- `OpaqueServer` keeps no per-request state: the handshake's `expected` value goes from `authInit` to
  `authFinish` through Redis (`login:<attemptId>`), so one shared instance serves every request.
- opaque-ts takes the OPAQUE password as a base64 string for each login, which JavaScript can't wipe
  (`docs/security/threat-model-inputs.md`).
