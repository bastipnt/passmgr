# @repo/ui-native

Mobile component library for [passmgr](../../README.md). Tamagui-based.

## Consumers

- `apps/mobile`

## What's in here

- Native primitive components (Button, Input, Screen, ...) configured against the Tamagui config
- Layout helpers tuned for React Native
- Shared screen scaffolds used by auth flows

## Conventions

- Style via Tamagui props. Where NativeWind survives, keep it isolated to a single style layer per component.
- Color via tokens from `@repo/ui-shared`. The Tamagui config maps tokens onto Tamagui's theme system.
- Keep components stateless — feed them via props from screen-level containers.

## Status

The migration from NativeWind-only to Tamagui is recent (see git log: `chore(mobile): use tamagui for component styling`). Some components may still mix both — please consolidate when touching them.
