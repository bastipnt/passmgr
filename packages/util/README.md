# @repo/util

Small, generic utilities shared across the [passmgr](../../README.md) monorepo. No domain logic.

## Consumers

- `apps/web`
- `apps/server`
- `apps/mobile` (transitively)

## What's in here

- Base64 / base64url encoding + decoding
- String / byte conversion helpers (`utf8ToBytes`, `bytesToUtf8`, ...)
- Misc type guards

## Conventions

- Pure functions only. No I/O, no state.
- If a helper grows domain-specific (touches crypto, schema, DB), move it to the right package instead.
