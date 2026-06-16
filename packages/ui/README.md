# @repo/ui

Web component library for [passmgr](../../README.md). shadcn-based, built on Tailwind v4.

## Consumers

- `apps/web`

## What's in here

- Primitive components (Button, Input, Card, Dialog, ...) following the shadcn pattern — copy-in, not opaque dependency
- `cn()` helper exported from `@repo/ui/theme` for conditional class composition
- Re-export of `react-hook-form` so consumers don't pull it directly
- Form components wired into `react-hook-form` + `@repo/schema`

## Conventions

- All components consume color via design tokens from `@repo/ui-shared` (e.g. `primary-500`, `surface-3`).
- Conditional class names: `cn()`, not template strings.
- Keep components dumb. Business logic belongs in app code or `@repo/client`.

## Storybook

```bash
pnpm storybook
pnpm build:storybook
```
