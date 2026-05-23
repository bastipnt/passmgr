# @repo/types

Shared TypeScript types for [passmgr](../../README.md) that don't have a runtime representation. For runtime-validated schemas, use `@repo/schema` instead.

## Consumers

- Used wherever client and server need to agree on a type without paying for a Zod runtime check.

## What's in here

- Branded types (e.g. `UserId`, `EntryId`) to prevent mixing up IDs at the type level
- Discriminated unions for protocol messages
- Utility types

## When to put a type here vs `@repo/schema`

- **Here**: type-only. No validation needed. Internal contracts between trusted code paths.
- **In `@repo/schema`**: any payload that crosses tRPC, hits the DB, or comes from a user. You need a Zod schema there for runtime safety.
