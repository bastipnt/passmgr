# @repo/tokens

Design tokens for [passmgr](../../README.md): colors, spacing, typography scales. Source of truth for the visual language across web and mobile.

## Consumers

- `apps/web` (via Tailwind theme extension)
- `apps/mobile` (via Tamagui config)
- `@repo/ui`, `@repo/ui-native`

## What's in here

- Color tokens (e.g. `primary-500`, `surface-3`, `text-primary`)
- Spacing scale
- Typography tokens

## Conventions

- Don't hardcode colors or sizes in components. Always reference tokens.
- Add new tokens here first, then wire them into the consuming theme.
