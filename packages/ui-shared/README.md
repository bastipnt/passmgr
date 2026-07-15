# @repo/ui-shared

Cross-platform design tokens for [passmgr](../../README.md). Source of truth for the visual language across web and mobile.

## What's in here

- **`src/tokens/theme.css`** — the semantic color palette (`--color-background`, `--color-primary`, …) as CSS custom properties, defined once for both platforms. Exported as `@repo/ui-shared/theme.css`.
- **`src/tokens/colors.ts`** — only the colors JS reads directly: `BRAND_GRADIENT`, `LEVEL_COLOR`.
- **`src/hooks/use-website-avatar.ts`** — favicon lookup + fallback hue.

## Consumers

- `@repo/ui` → `packages/ui/src/styles/globals.css` imports `theme.css` (web)
- `apps/mobile` → `apps/mobile/src/global.css` imports `theme.css` (uniwind `cssEntryFile`)

Both then generate the same utility names (`bg-primary`, `text-primary-foreground`, …).

## Conventions

- Don't hardcode colors in components — use the utilities, or read a token with uniwind's `useCSSVariable("--color-primary")` on native / `var(--color-primary)` on web.
- Add new semantic colors to `theme.css`, in **both** the `light` and `dark` blocks. See the header comment there: the file's shape is load-bearing for uniwind's parser, and a token missing from one variant is a hard error.
- Scales (`spacing`, `radius`, `text`) are deliberately **not** shared — web and mobile use different values. They live in each platform's own entry stylesheet.
