# apps/web

Web-specific guidance. Cross-cutting rules are in the root `CLAUDE.md`; feature flows in `docs/architecture/`.

## Web app structure (`apps/web/src`)

```
app/         Composition root: App.tsx, routes.tsx (top Switch), route-paths.ts, ErrorFallback, NotFound
features/    auth/ · records/ (with records/login/, records/versions/) · password-generation/ · pass-monitor/ · settings/ · vaults/
components/  App-wide, feature-agnostic components only
hooks/ lib/ test/ types/
```

Rules:

- **Feature folders are flat.** Files sit directly in the feature. Nest only for a
  sub-domain (`records/login/` = the login record type, `records/versions/` = version
  history), **never** by file kind — no `components/`, `hooks/`, `pages/`, `forms/`,
  or `providers/` inside a feature.
- **Sub-domain vs. top-level feature: dependency direction decides, not file count.**
  A sub-domain stays *inside* its parent when it can't stand alone — no top-level route
  of its own, or it needs the parent's internals. Lifting it out would make the parent's
  `routes.tsx` import it while it imports back through the parent barrel: a cycle. It
  graduates to a top-level feature only once nothing in it imports the parent.
- **Sub-domain folders have no `index.ts`.** Import them by path (`./versions/VersionsSheet`).
  A barrel inside a feature hides the dependency graph and invites cycles.
- **Sub-domain files may climb exactly one level** (`../use-route-sheet`,
  `../login/TotpField`) to reach their parent feature; two or more is banned by
  `no-restricted-imports` — use `@/` for anything further.
- **Screens live in their feature** (`features/auth/LoginPage.tsx`). There is no
  top-level `pages/`. Only app-shell screens (`NotFound`, `ErrorFallback`) live in `app/`.
- **Every route string is in `app/route-paths.ts`** (`authPaths`, `recordPaths`).
  Never hardcode a path in a component.
- **Cross-feature imports go through the barrel**: `@/features/password-generation`,
  never `@/features/password-generation/PasswordField`. Enforced by
  `no-restricted-imports` in `apps/web/.oxlintrc.json`.
- **Inside a feature, use relative `./` imports.** Importing your own feature via `@/features/...`
  creates a cycle through the barrel.
- **One alias: `@/` → `src/`.** (`@pages`, `@components`, `@features`, `@utils` were removed.)
  Declared in three places that must stay in sync: `vite.config.ts`, `vitest.config.ts`,
  `tsconfig.app.json`.
- Web `features/records/` matches mobile's `features/records/` naming.
- **Phone pages are real routes that scroll the document**, never drawers. The push/pop slide is
  `app/page-transitions.ts` (View Transitions, driven by the router's location hook). A new page
  gets an entry in `pageDepths` (`app/route-paths.ts`) and its back button uses
  `usePageBack(fallback)`. Import phone pages eagerly — a page that suspends mid-transition slides in blank.
- **Record list layout** (`features/records/RecordLayout.tsx`). Desktop: no header bar, three columns. The sidebar
  sits on the ground (`ShellPanel surface="ground"`): `SidebarHeader` (`VaultSwitcher`, collapse toggle, New record),
  `CategorySidebar` (collapsible to icons, `useSidebarCollapsed`; neutral selection, the accent marks the list's),
  `SidebarTagsRow` (tag count or "N on"; opens the search in tag mode, `searchTags`), `SidebarFooter` (Pass Monitor,
  Account & sync, Settings, `SyncStatusCard`), Lock vault. `RecordList` is the only raised panel (`RecordSearch` + heading
  + `RecordSortMenu`, then `ActiveFilterChips variant="desktop"`: neutral chips + Clear all; `SearchPanel` while searching);
  the record sits on the ground, one column (`RecordDetail`: the form at rest, `@repo/client` `recordDetailLayout`
  builds it from `RECORD_FORM_FIELDS` / `RECORD_FORM_LAYOUT`: the same sections in the same order, fields paired where
  the form pairs them (`DetailFieldRow`), empty ones left out, then websites, extra fields (two per row), note, Version
  history; a secure note starts with its note. Machine values mono, card number masked to first / last 4 + network,
  expiry chip (`cardExpiryStatus`), identity address as one block (Copy address), SSH key Type · Fingerprint, private
  key blurred (`DetailCodeBlock concealable`, nothing of it in the DOM until shown) + download, API secret keeps its
  prefix (`apiSecretPrefix`), Wi-Fi QR full screen only while the page is in view; previous secrets fold into one
  row, `PreviousSecretsRow`). Collapsed, the sidebar is a rail of icons (`SidebarItem collapsed`: label and tally in a tooltip, only `primary` /
  `warning` counts as a corner badge / dot), the expand toggle moving to its foot above Lock.
  Phone: `MobileVault`: bar with the vault pill and `AccountButton` (`AccountSheet`: the same pages, sync card, Lock),
  the list's large title over `ActiveFilterChips`, and a bottom dock (`FilterButton` → `FilterSheet`, search, sort, new). The dock's search pill opens
  `MobileSearch`: a full-screen layer portaled to `<body>` (no z-index, so sheets opened from it cover it), always
  mounted so the tap can `focus()` it (iOS raises the keyboard only then), the page behind `inert`. Its open state is a
  history entry over the list (`mobileSearch` in `history.state`): Back closes it, Back from a record opened in it
  reopens it with the field focused (the record's Back tap holds the keyboard, `@repo/ui` `holdKeyboard` /
  `handOffKeyboard`). Clear all drops tags and category; Cancel / Back restores the filters it opened with. Empty, it lists recent searches (tap reruns text + tags) and recently opened. A tag pill bar
  (`TagPillBar`, `@repo/client` `pillTags`: selected, then matching the text, then by use) rides on the keyboard at
  `--kb-inset` (`@repo/ui` `useKeyboardInset`: `visualViewport`, 0 on Android where `interactive-widget` resizes the
  layout); its `pointerdown` is prevented so a tap never blurs the field, and a tap
  that blurred it anyway (iOS) focuses it again. A pill matching the text replaces it. Picked tags show as `TagPill`
  tokens in the field (✕ removes one, Backspace on an empty field the last; not on key repeat), the placeholder
  "Search in tag" / "Search in N tags", and with nothing typed their records under "Tagged #a". In `#` tag mode the
  pill bar gives way to `TagModeBar` (same `KeyboardBar` slot): "N tags · M items", Clear, Show M items / done key.
- **Record form** (`features/records/RecordForm.tsx`): one form for every type, create and edit. `@repo/client`
  `RECORD_FORM_FIELDS` lists each type's inputs (login included; title, tags, note, websites, extra fields are common)
  and `RECORD_FORM_LAYOUT` places the common parts (`noteFirst`, `websites`, `actions`); `RecordFormField` maps a
  spec's `kind` to a boxed control (`ControlledBoxedInput` & co., `@repo/ui/components/form`). `width` pairs fields on
  wide screens, `phoneShare` keeps a row on phones (`phoneRows`). Websites and extra fields reorder by a row's handle
  (drag or ↑ / ↓, `SortableList`). Both sheets wrap it in `RecordFormSheet` (desktop: avatar + "Edit login" header,
  Delete / Back left, Cancel + submit right; phone: `SheetFormBar`, the record header and Delete in the content). The
  create sheet's Vault picker is a form field (`vaultField`); an edit moves with "Move to vault…" instead.
- **Theme presets** (`@repo/ui-shared/presets.css`): Berry on `:root`, Violet / Cobalt / Pine / Ember / Graphite via
  `data-accent` on `<html>` (or any element, for a swatch; a `light` / `dark` class on it picks the mode, the nearest
  one wins). Picked in Settings → General (`AccentPicker`, `ThemeProvider`'s `accent`, per device next to the theme,
  `<themeKey>-accent`; `applyStoredAccent` in `main.tsx` sets it before React renders). List: `@repo/ui-shared` `ACCENT_PRESETS`. Accent as text is `text-primary-text`, never `text-primary`
  (that's the fill: buttons, the TOTP ring). Meaning colors (strength, warnings, destructive) never take the accent.
  The light field is for auth screens only: unlocked shells call `useFlatGround` (`@repo/ui/hooks/use-flat-ground`,
  `data-ground="flat"` on `<html>`), which gives the flat ground and turns `glass` / `glass-popover` solid without blur.
  The logo (`BrandMark`) is a `bg-primary` tile, so it follows the accent (auth screens too).
- **Phone buttons are 48px**: sheet actions (`ResponsiveSheet` `actions`) use `size="lg"` for text,
  `SheetIconAction` for icons, `SheetCloseAction` for the X (`@repo/ui/complex-components/ResponsiveSheet`);
  floating page-bar buttons use `size="icon-xl"` / `"lg"`. Bottom-dock FABs stay `fab` (56px). The bars'
  sticky-title math (`MobileVault` `--list-top`, `MobileListTitle`, `MobileRecordPage` h1) assumes 48px.

## E2E tests

Web E2E: **Playwright** (`pnpm --filter web e2e`, specs `apps/web/e2e/*.e2e.ts`). Global setup builds and
starts `docker-compose.test.yml` (web + server + Postgres + Redis, fresh OPAQUE secrets) and tears it down
after; `E2E_KEEP_STACK=1` leaves it running. Web keys live in memory, so after an unlock navigate by
clicking, never `page.goto` (it reloads → locked). A second / third device = the `secondDevice` / `thirdDevice` fixtures (`test` from `e2e/helpers/devices.ts`);
offline = `context.setOffline(true)`. Helpers: `e2e/helpers/auth.ts` (register / login), `e2e/helpers/vault.ts`
(local vault, create / edit / read a record of any type by input name (`createRecord`, `editRecord`, `expectRecord`; login
shortcuts with websites and tags), the listed records, desktop search + its options, password issues,
Lock from the sidebar, sync status). The styled `Link` from `@repo/ui` has role `button`; plain wouter links stay `link`.

## Web served-code trust

Web served-code trust (`apps/web/vite-plugin-build-integrity.ts`, after the bundle is written): SRI on the asset tags
of `index.html`, then the service worker's precache manifest with each precached file's SRI hash (`public/sw.js` installs with
`integrity`, all or nothing), then `SHA256SUMS` of `dist`. `release.yml` attaches it to the GitHub release
(`web-checksums`); `pnpm --filter web verify:deployment <url> <SHA256SUMS>` checks a deployment against it. What it does and doesn't
protect against: `docs/security/web-served-code-trust.md`.
