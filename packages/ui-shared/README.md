# @repo/ui-shared

Cross-platform design tokens for [passmgr](../../README.md). Source of truth for the visual language across web and mobile.

## What's in here

- **`src/tokens/theme.css`** — the semantic color palette (`--color-background`, `--color-primary`, …) as CSS custom properties, defined once for both platforms. Exported as `@repo/ui-shared/theme.css`.
- **`src/tokens/presets.css`** — web: the accent presets (Berry default on `:root`, others via `data-accent="<preset>"`) that override `theme.css`. Exported as `@repo/ui-shared/presets.css`.
- **`src/tokens/accents.ts`** — the preset list, labels and the same colors for native (`ACCENT_COLORS`, `accentVariables`: every `--color-*` a preset sets, which mobile applies at runtime). `test/presets.test.ts` checks contrast and that both stay equal.
- **`src/tokens/colors.ts`** — only the colors JS reads directly: `LEVEL_COLOR`, `FIELD_COLORS` (light-field blobs / spectrum text).
- **`src/tokens/avatar.ts`** — avatar tiles: `AVATAR_TILE` (edge + radius in px per size), `AVATAR_FALLBACK` (OKLCH lightness / chroma of the hue-tinted fallback per theme). Native reads them directly; web keeps Tailwind classes and `--avatar-fallback-*` vars, checked by `test/avatar.test.ts` and web's `avatar-tile.test.tsx`.
- **`src/tokens/native-fonts.ts`** — `FONT`: the font families mobile embeds, for raw native styles. `test/native-fonts.test.ts` checks them against mobile's `global.css`, `app.json` and font files.
- **`src/hooks/use-website-avatar.ts`** — favicon lookup + fallback hue.

`test/field-styles.test.ts` checks that web's and native's text-field class strings share the same surface.

## Consumers

- `@repo/ui` → `packages/ui/src/styles/globals.css` imports `theme.css` and `presets.css` (web)
- `apps/mobile` → `apps/mobile/src/global.css` imports `theme.css` (uniwind `cssEntryFile`)

Both then generate the same utility names (`bg-primary`, `text-primary-foreground`, …).

## Conventions

- Don't hardcode colors in components — use the utilities, or read a token with uniwind's `useCSSVariable("--color-primary")` on native / `var(--color-primary)` on web.
- Add new semantic colors to `theme.css`, in **both** the `light` and `dark` blocks. See the header comment there: the file's shape is load-bearing for uniwind's parser, and a token missing from one variant is a hard error.
- The general scales (`spacing`, `radius`, `text`) are deliberately **not** shared — web and mobile use different values. They live in each platform's own entry stylesheet. Only the avatar tile sizes are shared (`AVATAR_TILE`), since both platforms draw the same tiles.
