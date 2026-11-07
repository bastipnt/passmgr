# @repo/web

Web client for [passmgr](../../README.md). React 19 + Vite + Tailwind v4. Public demo: [passmgr.bastipnt.de](https://passmgr.bastipnt.de).

## Stack

- **React 19** + **Vite** (overridden globally to `rolldown-vite` via pnpm overrides)
- **Tailwind CSS v4** for styling, with design tokens from `@repo/ui-shared`
- **wouter** for routing
- **tRPC** client via `@repo/client` (handles HMAC request signing transparently)
- **react-hook-form** + Zod schemas from `@repo/schema`
- On-device encrypted SQLite (SQLocal on OPFS) via `@repo/store`; crypto and Argon2 run in Web Workers

## Current features

- Local vaults without an account (offline-first), or an account via OPAQUE login; link a local vault later
- Several vaults, many record types, tags, favorites, search, trash, version history, TOTP, password generator
- Pass Monitor (weak / reused / breached passwords)
- Two-factor, recovery key, password change, biometric unlock (WebAuthn PRF), device login
- Backup export / restore and import from CSV, Bitwarden, 1Password and KeePass
- Sync with conflict merge, shared vaults
- PWA with offline support, phone layout, themes and accent colors
- Served-code integrity (SRI, `SHA256SUMS`): [docs/security/web-served-code-trust.md](../../docs/security/web-served-code-trust.md)

## Known gaps

- Web keys live in memory only: a reload locks the vault
- Served-code trust is inherent to web apps; see the doc above

## Dev

```bash
pnpm --filter web dev
```

Dev server runs on Vite's default port (5173).

### Demo build

`VITE_DEMO_MODE=true` builds the public demo (example data, everything stays in the browser). Locally:

```bash
VITE_DEMO_MODE=true pnpm --filter web dev --port 5179
```

### Tests

```bash
pnpm --filter web test   # Vitest
pnpm --filter web e2e    # Playwright (builds and starts a Docker test stack)
```

### README screenshot

`docs/images/vault.png` is generated from the demo; re-run after a visible UI change:

```bash
pnpm --filter web screenshot:render
```

### Styling conventions

- Use Tailwind utilities first.
- For conditional classes use `cn()` from `@repo/ui/theme`.
- Color via tokens (`primary-500`, `surface-3`, `text-primary`) — avoid raw hex.

## Build

```bash
pnpm --filter web build
```
