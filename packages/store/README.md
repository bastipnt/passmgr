# @repo/store

Frontend data store + sync logic for [passmgr](../../README.md). Holds vault entries in memory after login and reconciles them with the server.

## Consumers

- `apps/web`

## What's in here

- **In-memory record store** — decrypted vault entries are kept here for the duration of the session.
- **Sync logic** — pull latest records on login, subscribe to server-side change events, conflict detection on update (versioned records).
- **Optimistic mutation handlers** — apply locally first, reconcile when the server confirms.

## Conventions

- Decrypted vault data only lives here in memory. On logout / lock, the store must be cleared.
- Don't persist anything from this store to disk / localStorage / IndexedDB. The threat model assumes the device may be compromised after the user has left the app.

## Tests

```bash
pnpm --filter @repo/store test
pnpm stryker:store   # mutation testing
```
