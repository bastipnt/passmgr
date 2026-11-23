# apps/mobile

Mobile-specific guidance (also covers `packages/ui-native` styling). Cross-cutting rules are in the root
`AGENTS.md`; feature flows in `docs/architecture/`.

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
  `withUniwind` to give them `className`; reanimated's view is wrapped once, `AnimatedView` (`@repo/ui-native`).
- **Look = web at phone width.** Screens wrap in `Screen` (`@repo/ui-native`; flat ground, `field` on auth
  renders the `LightField` blob backdrop). Stack `contentStyle`: pages `bg-edge-tint`,
  formSheets `bg-popover`. Lists and field groups are flush (`Section` / `SectionGroup`,
  `RecordListItem`, `RecordDetailsItem` — whole row copies), not boxed cards. Prefer native chrome:
  header bar items and `SegmentedControl` (SwiftUI picker). No bottom `Stack.Toolbar`: it collides with
  the tab bar. Page titles scroll into the bar via `useScrollTitle` (big title in content, bar title once scrolled).
  Record-list group labels pin under the bar via `StickyList` (takes `sections`; labels and rows render as flat
  siblings, one shared frost).
- **Header buttons are native `UIBarButtonItem`s** (`unstable_headerLeftItems` / `unstable_headerRightItems`), never
  React views in `headerLeft` / `headerRight` or floating over the content: iOS 26 wraps a React element in a
  custom-view bar item with its own liquid glass capsule, so a glass button of ours would sample that capsule instead of
  the content scrolling under the transparent header. Only real bar items get UIKit's glass and track the scroll view.
- **Fonts**: Bricolage Grotesque (display) + JetBrains Mono are vendored in `apps/mobile/assets/fonts`
  (named by PostScript name so iOS and Android resolve the same family) and embedded via the
  `expo-font` plugin. Classes `font-display`, `font-display-bold`, `font-mono`; `FONT` constant
  (`@repo/ui-shared`, a test checks it against `global.css` and `app.json`) for native options
  (`headerLargeTitleStyle`). Body text stays the system font.
- The generated `apps/mobile/src/uniwind-types.d.ts` (dtsFile) is git-ignored;
  `className` prop augmentations come from `uniwind/types` (referenced in the
  `*-env.d.ts` files).

## Scroll title and sticky labels

Scroll title (`hooks/use-scroll-title.tsx`): the screen renders its big title in the content; once that has scrolled
`threshold` px under the transparent bar, `titleInBar` flips so the header shows it. `scrollY` is the offset from the
bar's bottom edge, 0 at rest on both platforms: iOS insets the scroll view by the header
(`contentInsetAdjustmentBehavior`) and rests at minus that inset (measured at mount by `restAnchor`, the scroll
content's first child); Android has no inset, pads with `contentTopPadding` and rests at 0. Spread `scrollProps` onto a
reanimated `Animated.ScrollView`. Tapping the active tab scrolls to the rest offset: RN's own scroll-to-top targets
offset 0, which on iOS leaves the title under the bar.

Sticky labels (`features/records/components/StickyLabels.tsx`): in a `StickyList`, each section's label pins under the
header while its rows scroll by and is pushed out by the next one. It takes `sections` (label + keyed rows), not
children, and renders labels and rows as direct (flat) children: one shared frost sits between them in z-order
(rows < frost < labels), which RN can only do for siblings, and with one frost there is no hand-over between labels,
so it never blinks. The frost is web's masked sticky-bar frost: a native
blur from under the bar down through the label, washed with the page's edge tint, then a tint fade below so rows ease
into it; it follows the bar and fades in once the first label pins.

## Tab stacks

`useResetStackOnTabBlur` pops a stack to its root when its tab loses focus, so re-entering the tab starts at the
root, not a record opened before.

## Auto-lock

`useAutoLock` locks the vault when the app comes back after the `AUTO_LOCK_PREFERENCE` minutes in the background; a
lock, not a sign-out (vault and persisted login stay). Web's `use-idle-lock.ts` watches input instead, since a tab
stays interactive while untouched; a phone suspends timers once the app leaves the foreground, so time away is both
what can be measured and what matters.

## Record stream (SSE)

RN has no `EventSource`, so tRPC's `httpSubscriptionLink` gets `RNEventSourcePonyfill` (`src/lib/rn-event-source.ts`)
over `react-native-sse`. That library exposes `status`, not `readyState`; on failure it sets `ERROR` (-1), which the
adapter maps to `CLOSED` (tRPC tells fatal from retryable by `CLOSED`, and would otherwise sit in "connecting" with
nothing reconnecting); and its own reconnect is off, `StoreProvider` owns retry and backoff. A graceful stream end
(HTTP 2xx, request done) dispatches no event at all: the server's SSE pings plus
`sse.client.reconnectAfterInactivityMs` (`apps/server/src/trpc.ts`) make tRPC recreate the stream after silence.

## Autofill

Mobile autofill (iOS credential provider extension + Android `AutofillService`): `useAutofillSync` (mounted in the
unlocked tree) writes the open profile's `autofillEntries` (logins with a password) through `@repo/store`
`writeAutofillEntries` while the OS has the app's autofill on (`autofillState`), else drops them; sign out, `signedOut`
and profile removal drop them too (as does `forgetQuickUnlock`), a lock keeps them. Writes and clears of one profile run
in order. Native side `apps/mobile/modules/autofill` (Expo module, `PassmgrAutofill`): encrypts to a biometric-gated
device key (iOS Secure Enclave ECIES, Android Keystore RSA + AES-GCM), so writes never prompt and only the extension /
`AutofillAuthActivity` reads them after a biometric match (the app reads only pending logins, see below). iOS extension
`apps/mobile/targets/autofill` (`@bacons/apple-targets`; `AutofillVault.swift` is a symlink to the module's), groups
from `plugins/with-autofill.js`; needs `expo prebuild --clean`. Settings → Security `AutofillSection` shows the state
and opens the OS setting. "Create login" (Proton-style, both platforms native, no RN in the extension: option A): the
iOS extension's list always ends with "Create login for <host>" (SwiftUI form, generated password from the profile's
generator defaults sent along in the entries payload, "Create & AutoFill"); Android's fill list ends with the same row
(`AutofillCreateActivity`), and `SaveInfo` (login + sign-up forms, `FLAG_DELAY_SAVE` for multi-step) offers "Save to
Passmgr?" into the same form. The login fills at once and is written encrypted to the autofill device key as a pending
login; `useAutofillSync` imports them on the next foreground unlock (`importPendingAutofillLogins`, biometric prompt,
personal vault, id kept so a repeat skips it) and deletes them. iOS also declares `ProvidesTextToInsert` (AutoFill
context menu: inserts a username or password; "Create login" there asks for the website, the menu doesn't say, and
inserts the password).

## Share

Mobile share ("save login from other apps"): the iOS share extension (`apps/mobile/targets/share`, no app group, nothing
stored; needs `expo prebuild --clean`) and Android's `ShareActivity` (`apps/mobile/modules/share`, `ACTION_SEND` text)
only open `passmgr://share?text=…`. `src/app/+native-intent.tsx` makes it `recordPaths.createLogin(sharedWebsite(text))`
(new login, website + host title; `@repo/client` `records/shared-login.ts`); while locked `routeSharedLogin` sends it
home and holds it until the unlocked tree mounts (`useOpenSharedLogin`).

## Error handling

Shared logic is in `packages/client/src/errors` (see `apps/web/CLAUDE.md`, "Error handling"): `userMessage`,
`describeError`, `logError`. Never call `console.*` directly, never render `error.message`.

- Route boundaries are expo-router's: route files and layouts re-export
  `RouteErrorFallback as ErrorBoundary` (`src/components/RouteErrorFallback.tsx`). Add the re-export to a new
  screen or layout so a crash stays in it. The fallback can't rely on providers (the root one sits above them).
- `useGlobalErrorToast` (root layout) sets `ErrorUtils.setGlobalHandler`: a toast with the error ID and
  "Copy error details"; in development the previous handler still runs (red box). Unhandled promise rejections
  are not covered.
- Crash counts: the fallback calls `reportNativeError` (server counter by kind / area / platform / release, nothing
  from the error); `routeErrorFallback(area)` takes the area. `ClientErrorReporter` sits in the root layout inside the
  providers. See `docs/ops/monitoring.md`, "Client crashes".
