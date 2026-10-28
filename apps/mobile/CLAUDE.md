# apps/mobile

Mobile-specific guidance (also covers `packages/ui-native` styling). Cross-cutting rules are in the root
`CLAUDE.md`; feature flows in `docs/architecture/`.

## Mobile styling (Uniwind)

`apps/mobile` + `packages/ui-native` style with **Uniwind** (Tailwind v4 for React
Native, `className` API) — the same mental model as web. No babel preset; classes
compile in the Metro transform via `withUniwindConfig` (`apps/mobile/metro.config.js`).

- Theme tokens live in `apps/mobile/src/global.css` as Uniwind `@variant light/dark`
  blocks, transcribed from `@repo/ui-shared` colors (web kebab-case names, e.g.
  `bg-primary`, `text-primary-foreground`). The spacing scale (`p-md`, `gap-lg`)
  maps to the values the old Tamagui config rendered.
- `@source "../../../packages/ui-native/src"` in `global.css` makes Tailwind scan the
  sibling package (v4 only auto-detects the app itself).
- Compose variants with `cva` + `cn()` from `@repo/ui-native/lib/utils`, mirroring
  `packages/ui`.
- Accent presets: `global.css` holds one palette; the picked preset (Settings → General `AccentPicker`,
  `PREF_KEYS.accent`, device-level) overrides it in both modes at runtime (`applyAccent` in
  `use-theme-preference.ts`: `Uniwind.updateCSSVariables` with `@repo/ui-shared` `accentVariables`; `ACCENT_COLORS`
  must equal `presets.css`, a test checks it). Applied in a layout effect on launch, so no flash.
- Read tokens in JS via `useCSSVariable(name)` (in components) or
  `Uniwind.getCSSVariable(name)` (outside). Wrap non-core third-party components with
  `withUniwind` to give them `className`.
- **Look = web at phone width.** Screens wrap in `Screen` (`@repo/ui-native`; flat ground, `field` on auth
  renders the `LightField` blob backdrop). Stack `contentStyle`: pages `bg-edge-tint`,
  formSheets `bg-popover`. Lists and field groups are flush (`Section` / `SectionGroup`,
  `RecordListItem`, `RecordDetailsItem` — whole row copies), not boxed cards. Prefer native chrome:
  header bar items and `SegmentedControl` (SwiftUI picker). No bottom `Stack.Toolbar`: it collides with
  the tab bar. Page titles scroll into the bar via `useScrollTitle` (big title in content, bar title once
  scrolled). Record-list group labels pin under the bar via `StickyList`/`StickyLabel` (labels and rows as flat siblings, one shared frost).
- **Fonts**: Bricolage Grotesque (display) + JetBrains Mono are vendored in `apps/mobile/assets/fonts`
  (named by PostScript name so iOS and Android resolve the same family) and embedded via the
  `expo-font` plugin. Classes `font-display`, `font-display-bold`, `font-mono`; `FONT` constant for
  native options (`headerLargeTitleStyle`). Body text stays the system font.
- The generated `apps/mobile/src/uniwind-types.d.ts` (dtsFile) is git-ignored;
  `className` prop augmentations come from `uniwind/types` (referenced in the
  `*-env.d.ts` files).

## Autofill

Mobile autofill (iOS credential provider extension + Android `AutofillService`): `useAutofillSync` (mounted in the unlocked
tree) writes the open profile's `autofillEntries` (logins with a password) through `@repo/store` `writeAutofillEntries`
while the OS has the app's autofill on (`autofillState`), else drops them; sign out, `signedOut` and profile removal drop
them too (as does `forgetQuickUnlock`), a lock keeps them. Writes and clears of one profile run in order. Native side `apps/mobile/modules/autofill` (Expo module, `PassmgrAutofill`): encrypts to a
biometric-gated device key (iOS Secure Enclave ECIES, Android Keystore RSA + AES-GCM), so writes never prompt and only the
extension / `AutofillAuthActivity` reads them after a biometric match (the app reads only pending logins, see below). iOS extension `apps/mobile/targets/autofill`
(`@bacons/apple-targets`; `AutofillVault.swift` is a symlink to the module's), groups from `plugins/with-autofill.js`;
needs `expo prebuild --clean`. Settings → Security `AutofillSection` shows the state and opens the OS setting.
"Create login" (Proton-style, both platforms native, no RN in the extension: `doc/mobile-extension.md` option A): the iOS
extension's list always ends with "Create login for <host>" (SwiftUI form, generated password from the profile's generator
defaults sent along in the entries payload, "Create & AutoFill"); Android's fill list ends with the same row
(`AutofillCreateActivity`), and `SaveInfo` (login + sign-up forms, `FLAG_DELAY_SAVE` for multi-step) offers "Save to
Passmgr?" into the same form. The login fills at once and is written encrypted to the autofill device key as a pending
login; `useAutofillSync` imports them on the next foreground unlock (`importPendingAutofillLogins`, biometric prompt,
personal vault, id kept so a repeat skips it) and deletes them. iOS also declares `ProvidesTextToInsert` (AutoFill context
menu: inserts a username or password; "Create login" there asks for the website, the menu doesn't say, and inserts the
password).

## Share

Mobile share ("save login from other apps"): the iOS share extension (`apps/mobile/targets/share`, no app group, nothing
stored; needs `expo prebuild --clean`) and Android's `ShareActivity` (`apps/mobile/modules/share`, `ACTION_SEND` text) only
open `passmgr://share?text=…`. `src/app/+native-intent.tsx` makes it `recordPaths.createLogin(sharedWebsite(text))` (new login,
website + host title; `@repo/client` `records/shared-login.ts`); while locked `routeSharedLogin` sends it home and holds it
until the unlocked tree mounts (`useOpenSharedLogin`).
