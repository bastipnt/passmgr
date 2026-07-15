# Migrate mobile off Tamagui → Uniwind

## Context

`apps/mobile` + `packages/ui-native` style with **Tamagui**. Web (`apps/web` + `packages/ui`) styles with **Tailwind v4 + shadcn + cva + `cn()`**. Goal: drop Tamagui, adopt **Uniwind** (Tailwind-for-RN, `className` API) so native converges on the web mental model and can share class strings / cva variant tables.

Both stacks already meet at **`@repo/ui-shared`** (design tokens: `colors.light/.dark` hex, palettes, `spacing`, `radius`, `fontSize`, `BRAND_GRADIENT`, `LEVEL_COLOR`). Tokens stay the single source; only the styling layer changes.

**Decisions (confirmed with user):**

- **No `react-native-unistyles`.** Uniwind and Unistyles are two API surfaces from the same team, not a combo. Uniwind Pro already runs on the Unistyles C++ engine internally — buy Pro later for zero-re-render perf with **no code change**. Adding Unistyles on top would fight Uniwind.
- **Tier:** start on **free JS engine** (full Tailwind v4, same `className` API). Pro upgrade is drop-in later.
- **API target:** **full web parity** — `cn()` + `cva` variants + same Tailwind class strings + granular per-file exports mirroring `packages/ui`.
- **Strategy:** **big-bang on a branch.** Surface is small (~30 components + 12 screens + 2 configs + root provider); avoids running `withTamagui` + `withUniwindConfig` and two token systems simultaneously.

**Compatibility (verified):** Uniwind needs RN ≥0.81 / React ≥19 / Tailwind v4 / Node ≥20. Mobile has RN `0.85.3`, React 19, Expo `~56.0.15`. Web already on Tailwind v4. ✅

---

## Phase 0 — Branch + deps + build config

1. Branch: `feat/mobile-uniwind`.
2. `apps/mobile/package.json`:
   - **Add:** `uniwind`, `tailwindcss` (v4, match web's version), `class-variance-authority`, `tailwind-merge`, `clsx`, and an RN icon lib to replace `@tamagui/lucide-icons-2` → **`lucide-react-native`** (+ its peer `react-native-svg`, already present).
   - **Remove:** `tamagui`, `@tamagui/lucide-icons-2`, `@tamagui/babel-plugin`, `@tamagui/metro-plugin`.
3. `packages/ui-native/package.json`:
   - **Remove** deps `@tamagui/config`, `@tamagui/themes`; peer `tamagui`, `@tamagui/lucide-icons-2`.
   - **Add** peers `uniwind`, `tailwindcss`, `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react-native`.
4. `apps/mobile/metro.config.js`: replace `withTamagui(...)` wrapper with:
   ```js
   import { withUniwindConfig } from "uniwind/metro";
   export default withUniwindConfig(config, {
     cssEntryFile: "./src/global.css",
     themes: ["light", "dark"],
   });
   ```
   **Preserve** the existing `sqlocal` stub + `@noble/hashes` subpath resolver logic and `watchFolders`/`nodeModulesPaths` (needed so metro transpiles `@repo/ui-native` and intercepts its `react-native` imports).
5. `apps/mobile/babel.config.js`: remove the `@tamagui/babel-plugin` block. Uniwind needs **no babel preset**. Keep reanimated/worklets + React Compiler plugins.
6. Delete stale NativeWind stubs: `apps/mobile/nativewind-env.d.ts` and the `className`/`cssInterop` augmentations in `apps/mobile/types.d.ts`. Add a Uniwind types ref instead (`/// <reference types="uniwind/types" />` in a `uniwind-env.d.ts`, or `global.d.ts` with `declare module "*.css"`).

---

## Phase 1 — Tokens → Tailwind theme (`global.css`) + `cn()` helper

Uniwind theming is **CSS-first** but uses `@variant` theme blocks (not web's `@theme inline` importing external `:root`). Values still come from `@repo/ui-shared` — do **not** fork them.

1. Create `apps/mobile/src/global.css`:
   ```css
   @import "tailwindcss";
   @layer theme {
     :root {
       @variant light {
         --color-background: <hex>;
         --color-primary: <hex>; /* …all semantic names… */
       }
       @variant dark {
         --color-background: <hex>;
         --color-primary: <hex>; /* same var set */
       }
     }
   }
   ```
   Map every semantic name currently in `tamagui.config.ts`'s `color` block (`background, foreground, card, cardForeground, muted, mutedForeground, primary, primaryForeground, primaryPressed, secondary, secondaryForeground, accent, accentForeground, destructive, border, input, ring`) plus `warning/error/success` from the child themes. Pull hex from `packages/ui-shared/src/tokens/colors.ts` (`colors.light/.dark`). Keep the file the **only** place values are transcribed; consider a tiny generator script from `colors.ts` so `light`/`dark` can't drift.
   - Add `spacing`/`radius`/`fontSize` scales to the theme (or rely on Tailwind defaults where equivalent) so `p-lg`, `rounded-lg`, `text-xs` resolve to the ui-shared scale.
   - Import it once at the app entry (`apps/mobile/src/app/_layout.tsx`): `import "../global.css";`.
   - Add Tailwind **source globs** so classes in the workspace package are scanned: `@source "../../../packages/ui-native/src";` in `global.css` (v4 auto-detects the app, but sibling packages need explicit `@source`).
2. Create `packages/ui-native/src/lib/utils.ts` with `cn()` = `twMerge(clsx(...))` — **copy `packages/ui/src/lib/utils.ts`**. Export via a new `./lib/*` path in `packages/ui-native/package.json` exports (mirror web's export map).
3. **Move `packages/ui-native/package.json` `main`/`exports` to a granular map** like `packages/ui` (`"./components/*"`, `"./lib/*"`, `"./blocks/*"`, `"./features/*"`) instead of the single barrel — this is the "closer to web" export convergence.

---

## Phase 2 — Migrate `packages/ui-native` components (bulk of work)

Delete `src/tamagui.config.ts`, `src/utils.ts` (`sizeToSpace`), and the `tamaguiConfig` re-export from `index.ts`.

**Translation patterns:**

| Tamagui                                                                           | Uniwind                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `<YStack>` / `<XStack>` / `<View>`                                                | `<View className="flex-col …">` / `flex-row` / `<View>` (RN)       |
| `<Text>` / `<SizableText>`                                                        | `<Text>` (RN) + className                                          |
| shorthand props `bg="$background" p="$lg" rounded="$lg" items="center" gap="$md"` | `className="bg-background p-lg rounded-lg items-center gap-md"`    |
| token color `color="$primary"`                                                    | `className="text-primary"`                                         |
| `styled(Comp, { variants })` (Badge, Empty)                                       | `cva()` table + `cn()`, mirror web `Button`/`Badge`                |
| `theme="error"` / `theme="blue_accent"`                                           | explicit classes (`bg-destructive`, accent classes)                |
| `useTheme().primary?.val` (Spinner, Skeleton)                                     | `useCSSVariable('--color-primary')` (Uniwind hook)                 |
| `getTokenValue($primary)` for SVG props (BrandMark, BiometricGlyph)               | `getCSSVariable('--color-primary')` (Uniwind)                      |
| `pressStyle` / `focusStyle`                                                       | `active:` / `focus:` variants, or `Pressable` + state              |
| Tamagui `Button`                                                                  | `Pressable`/`Text` + `buttonVariants` cva (copy from web `Button`) |
| `@tamagui/lucide-icons-2` icons                                                   | `lucide-react-native` icons                                        |

**Component-by-component (each: swap primitives → RN, props → className, wire variants via cva):**

- **Simple re-styles:** `Badge` (cva), `Empty`+subparts (cva variant `default|icon`), `Card`+subparts (now honor the `className` it currently ignores), `Link`, `FieldError`, `FieldGroup`, `RecordGroupLabel`, `Wordmark`, `StrengthMeter`, `CloseChip`.
- **Wrappers:** `BlurView` (wrap `expo-blur` + `className` via `withUniwind` if needed), `KeyboardAvoidingView` (RN + className).
- **Hook-driven:** `Spinner` (RN `ActivityIndicator` + `useCSSVariable`), `Skeleton` (reanimated shimmer + `useCSSVariable`) — reanimated logic is portable, keep it.
- **SVG blocks (no tamagui styling, just token reads):** `Blobs` (already pure svg), `AppIcon`, `BrandMark`, `BiometricGlyph`, `SplashGradient` — swap `getTokenValue` → `getCSSVariable`.
- **Reanimated:** `SpinnerRing` — replace `styled(Animated.View)` + `borderWidth="$2.5"`/`@ts-expect-error` with `Animated.View` + className/style; keep rotation worklet.
- **Forms:** `Input`+`ControlledInput` (real `className` now; `focusStyle` → `focus:`; RHF `Controller` unchanged), `PasswordInput` (Eye toggle → `lucide-react-native`).
- **Avatar** family: drop Tamagui `unstyled` Avatar; the `AvatarSizeContext` hack emulated web's `group-data-[size]` — with Uniwind you can move toward web's `data-*`/variant approach, but keeping the context is fine for parity. `Button` re-export: replace with a real cva `Button` copied from `packages/ui/src/components/Button`.
- **`RecordListItem` / `RecordDetailsItem`:** highest effort — rebuilt from Tamagui `ListItem`/`YGroup`/`Card` (no RN equivalent). Compose from RN `Pressable`/`View`/`Text` + className; keep `useWebsiteAvatar`, hue fallback, hidden-value masking, `LEVEL_COLOR` logic.
- **`SheetScene`:** `KeyboardAvoidingView` + `View bg-background` + `Button` (cva). The commented-out hand-styled button hints at final look; use `bg-primary active:bg-primaryPressed`.

Rewrite `packages/ui-native/index.ts` (or drop the barrel per Phase 1.3) — remove `tamaguiConfig`/`AppTamaguiConfig` exports; keep `export * from "react-hook-form"`.

Representative files: `packages/ui-native/src/components/{Badge,Empty,Card,Input,Button}.tsx`, `.../blocks/{BrandMark,SheetScene,SpinnerRing,RecordDetailsItem}.tsx`, `.../features/record-list/RecordListItem.tsx`.

---

## Phase 3 — Migrate `apps/mobile` screens (12 files)

1. `apps/mobile/src/app/_layout.tsx`: remove `TamaguiProvider` + `tamaguiConfig` import; add `import "../global.css";`. Drive theme with `Uniwind.setTheme(colorScheme === "dark" ? "dark" : "system")` from RN `useColorScheme()` (keep `SafeAreaProvider` etc.).
2. Screens (`(auth)/{index,sign-in,sign-up}.tsx`, `(app)/settings.tsx`, `(app)/(records)/**`, `components/{SplashScreen,TermsRow}.tsx`, `features/records/components/{Record,RecordsList}.tsx`): swap Tamagui primitives/shorthands → RN + `className`; icons → `lucide-react-native`; update imports to the new granular `@repo/ui-native/...` paths.
3. Remove `apps/mobile/postcss.config.mjs` re-export if unused by native (it re-exports `@repo/ui-native/postcss.config`, a web/CSS-extraction path — verify nothing needs it).

---

## Phase 4 — Cleanup + verify

- Grep-assert zero residue: `rg -n "tamagui|@tamagui|TamaguiProvider|styled\(|getTokenValue|useTheme\(|\$(lg|md|primary|background)" apps/mobile packages/ui-native` returns nothing meaningful.
- `pnpm --filter mobile typecheck && pnpm --filter @repo/ui-native typecheck && pnpm lint`.
- Remove tamagui from pnpm catalog (`pnpm-workspace.yaml`) if no other consumer.
- Update `packages/ui-native/README.md` (currently says "NativeWind → Tamagui"; now Uniwind).
- Update `CLAUDE.md` mobile section + delete/replace the tamagui memory notes (`ui-native-tamagui-*`).

---

## Verification (end-to-end)

1. `pnpm --filter mobile start` (Expo) → launch iOS + Android.
2. Walk every screen: auth landing, sign-in, sign-up (form + password toggle + strength meter + error states), records list (grouped list, avatars), record detail (hidden value reveal, copy links), edit, settings, splash/spinner.
3. Toggle device dark/light → confirm `light`/`dark` theme vars flip and colors match web.
4. Check reanimated animations (SpinnerRing rotation, Skeleton shimmer) still run.
5. Compare a few screens visually against `apps/web` equivalents for token parity.
6. `pnpm typecheck` + `pnpm lint` clean; production bundle builds (`expo export` or EAS) to confirm build-time Tailwind extraction works.

## Key risks

- **Component-less Tamagui primitives** (`ListItem`, `YGroup`, `Card`, `Avatar`, `Separator`, `Anchor`, `Main`) have no RN equivalent — must be recomposed. Biggest effort in `RecordListItem`/`RecordDetailsItem`.
- **`@source` globs**: if classes in `@repo/ui-native` don't render, Tailwind isn't scanning the package — fix the `@source` path in `global.css`.
- **Token drift**: keep `global.css` values generated/copied from `@repo/ui-shared/colors.ts`, never hand-diverged.
- Uniwind theming syntax (`@variant` blocks) differs from web's `@theme inline` + external `colors.css` import — values shared, structure not.

---

## Reference: Uniwind facts

- Uniwind = Tailwind v4 bindings for React Native, by the Unistyles team. `className` API, drop-in NativeWind replacement, no babel preset. Classes compiled at Metro build time → native style objects.
- Free tier: optimized JS engine. Pro tier: C++ Unistyles engine (zero re-renders, native theme transitions, Reanimated 4).
- Runtime API: `Uniwind.setTheme('light'|'dark'|'system')`, `useUniwind()` → `{ theme, hasAdaptiveThemes }`, `useCSSVariable(name)`, `getCSSVariable(name)`, `updateCSSVariables()`.
- Docs: https://docs.uniwind.dev/ — see Quickstart, Monorepos, Theming Basics, Custom Tailwind Themes, Migrate from NativeWind.
