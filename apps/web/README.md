# @repo/web

Web client for [passmgr](../../README.md). React 19 + Vite + Tailwind v4.

## Stack

- **React 19** + **Vite** (overridden globally to `rolldown-vite` via pnpm overrides)
- **Tailwind CSS v4** for styling, with design tokens from `@repo/ui-shared`
- **wouter** for routing
- **tRPC** client via `@repo/client` (handles HMAC request signing transparently)
- **react-hook-form** + Zod schemas from `@repo/schema`

## Current features

- Register (OPAQUE flow, generates recovery key locally — never sent to server)
- Login (OPAQUE flow, derives `sessionKey` → `sessionSecret` + `authKey`)
- Vault: list, view, add, edit, delete entries
- Real-time record sync via tRPC subscriptions

## Known gaps

- No idle lock or auto-relock
- No password recovery UI (recovery key works at the protocol layer, just no flow to consume it)
- No tab-visibility / lock-on-blur

## Dev

```bash
pnpm --filter web dev
```

Dev server runs on Vite's default port (5173).

### Styling conventions

- Use Tailwind utilities first.
- For conditional classes use `cn()` from `@repo/ui/theme`.
- Color via tokens (`primary-500`, `surface-3`, `text-primary`) — avoid raw hex.

## Build

```bash
pnpm --filter web build
```
