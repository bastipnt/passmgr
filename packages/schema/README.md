# @repo/schema

Zod schemas shared between client and server for [passmgr](../../README.md). Single source of truth for any payload that crosses the network boundary.

## Consumers

- `apps/web`
- `apps/server`
- `apps/mobile` (via `@repo/client`)

## What's in here

- **User schemas**
  - Registration request / response / record
  - Login start / finish
  - Key material (encrypted vault key, recovery wrap)
- **Vault entries**
  - Login item (decrypted shape)
  - Encrypted login item payload (the ciphertext shape that hits the wire / DB)

## Conventions

- If a schema is used on both sides of tRPC, it belongs here — not in `apps/*`.
- Re-export via the package barrel `index.ts` so consumers import from `@repo/schema`, not deep paths.
- Zod version is pinned via the root `pnpm.overrides` to keep all consumers in sync.
