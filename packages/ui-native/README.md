# @repo/ui-native

Mobile component library for [passmgr](../../README.md). Styled with
[Uniwind](https://docs.uniwind.dev/) (Tailwind v4 for React Native).

## Consumers

- `apps/mobile`

## What's in here

- Native components (Button, Input, Card, Badge, Avatar, ...) styled with
  Tailwind `className` strings, mirroring the web `@repo/ui` mental model
- `cva` variant tables + `cn()` (`./src/lib/utils`) shared with the web stack
- SVG/brand blocks and shared screen scaffolds (SheetScene) used by auth flows

## Conventions

- Style via `className` (Tailwind classes). Compose variants with `cva` and merge
  with `cn()` from `./lib/utils`, exactly like `@repo/ui`.
- Semantic colors come from `apps/mobile/src/global.css`, which transcribes the
  `@repo/ui-shared` token palette into Uniwind `@variant light/dark` theme blocks.
  Class names use web kebab-case (`bg-primary`, `text-primary-foreground`) so class
  strings/variant tables are shareable with the web app.
- Read a token from JS (SVG fills, Animated styles) with `useCSSVariable(name)` in
  components or `Uniwind.getCSSVariable(name)` outside them.
- Wrap non-core third-party components (e.g. `expo-blur`) with `withUniwind` to
  accept `className`.
- Keep components stateless — feed them via props from screen-level containers.

## Notes

- No babel preset is required; classes are compiled in the Metro transform via
  `withUniwindConfig` (see `apps/mobile/metro.config.js`). Sibling package classes
  are scanned via the `@source` glob in `global.css`.
- Free JS engine today; the Pro C++ engine is a drop-in upgrade with no code change.
