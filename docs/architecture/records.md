# Records: Pass Monitor, favorites, duplicate, tags and search

Record features shared by web and mobile (`packages/client` `records/`, `SortedRecordsProvider`).

## Pass Monitor and breach check

Pass Monitor (`usePassMonitor`, `records/pass-monitor.ts`; web Settings → Pass Monitor, `features/pass-monitor/`): login and
Wi-Fi passwords (`monitoredPassword`) across every vault, on the device after decryption. Weak = zxcvbn score < 3 (rated
in chunks, ratings cached per version, never the password). zxcvbn costs 100–500 ms a password: every rating goes through
`strengthWorkerService` (`@repo/crypto/services`; a Web Worker on web, deferred on the JS thread on mobile), incl.
`usePasswordStrength`, never `getStrengthFromString` on the main thread, reused = exact match, duplicates = same username on a shared
website host (the email stands in for a missing username, `loginAccountName`), old = `passwordChangedAt` (fallback `firstCreatedAt`) ≥ 365 days. `passwordChangedAt` is stamped by
`RecordRepository` only (create / a changed password; forms never carry it; an import keeps the backup's) and follows
`password` in `mergeRecord`.
Logins only: insecure websites = a website on `http://` (loopback aside), missing 2FA = a password and no `totp`, the
host (or a domain above it) is in the bundled 2fa.directory TOTP list (`records/two-factor-directory.json`, lazy-loaded;
refresh with `pnpm --filter @repo/client two-factor-directory:update`, MIT, keep the credit); record detail links its
setup docs (`useMissingTwoFactor`). No network request.
Record detail (web `PasswordHealthLine` under a login's or Wi-Fi's password): one line with strength and "Not breached", plus an
"N issues" toggle opening `passwordIssues` (breached, weak, reused, old, missing 2FA, most urgent first; each with its fix:
Change, Show for a single reuse, Set up with the site's 2FA docs, else Add code; Change / Add code only when writable) via `usePasswordHealth`; open state per record until a lock.
Sidebar badge (web desktop `SidebarFooter`): `usePassMonitorIssueCount`, the overview's counts summed (`passMonitorIssueCount`, duplicates aside) with weak only from ratings the Pass Monitor cached and breaches only from stored results, so it runs no zxcvbn and no request.
Security score (`securityScore`, `records/security-score.ts`; web `SecurityScoreCard` atop the Pass Monitor): the mean
per-password health (1 minus the summed `SCORE_PENALTY`s, capped) over `usePassMonitor().monitored`; duplicates don't
count, a breached password keeps it below good. `undefined` while a counted check runs (the breach check too, until its
run ends); a check that is off or failed goes to `skipped` and the card names it.
Breach check (`useBreachCheck`, `records/breach-check.ts`): opt-in per profile + device (`Vault.setBreachCheckEnabled`,
off deletes every result), while the Pass Monitor is open the HIBP range API is asked directly from the client
(`pwnedPasswordHash`: only the 5-char SHA-1 prefix, `Add-Padding`; one request per prefix, 4 at a time, 429 backoff)
for passwords without a result or with one ≥ `BREACH_RECHECK_DAYS`. Results per record version in the profile DB
(`breach_checks`, never synced, pruned to current versions); record detail reads them only (`useStoredBreachCount`).
`api.pwnedpasswords.com` is the one third-party host in the `Caddyfile` CSP `connect-src`.

## Login email

Login `email` (optional, next to `username`): `loginAccountName` (the username, else the email) is the list subtitle,
the autofill username and the duplicates key; search matches both; a foreign import takes an "Email" text field as it.

## Favorites and categories

Favorites (`useToggleFavorite`): `favorite` in the encrypted payload, so a star is a new version (synced, in the
history as "Added to / Removed from favorites", shared with every member of a shared vault; `read` members only see it).
`SortedRecordsProvider` puts starred records in a `FAVORITES_LABEL` group atop the list in every sort (out of their
normal group; the A–Z non-letter group then gets `#`), filters apply, a search stays flat; `sortedRecords` is the shown order.
Web "All vaults" with several vaults (`canGroupByVault`): rows carry a vault letter badge on the avatar (`VaultMark`,
`showVaultBadges`, search results too); "By vault" in `RecordSortMenu` (`groupByVault`, device pref) groups by vault
instead (sort inside, starred first per vault, no favorites group, no badges); its headers are sticky like the
other labels (`sticky-label-interactive`: clickable while pinned, inert once pushed) and fold for the session
(`toggleVaultFold`; folded rows left out of `sortedRecords`).
The list's `categoryFilter` is `all`, `favorites` (starred, any type; no extra group) or a record type; `categoryCounts`
count each for the vault and tags in view (web: desktop `CategorySidebar`, phone `FilterSheet`).
Web: star in the record header (`FavoriteButton`); mobile: header bar item. Rows show a small star.

## Duplicate

Duplicate (web `MoreDropdown`, mobile record "More" menu): opens the create form as a copy, nothing saved until Save.
The URL carries only the source id (web `?new&duplicate=<id>`, mobile `recordPaths.duplicate`); `duplicateValues`
(`records/record-edit.ts`) titles it "(copy)" and drops `favorite` / `passwordChangedAt`; the source's vault is the default
target when writable (`useTargetVault`'s `preferredVaultId`). `read` members may duplicate into a vault of their own
(`useRecordVault().canDuplicate`). A source gone meanwhile closes the form (`useDuplicateSource`).

## Tags and search

Tags (`useTags` / `useTagActions`, `records/tags.ts`; no folders): `tags` in the encrypted payload, the tag list is derived
from the records (no tag entity, nothing on the server). Normalised by `@repo/schema` `tags.ts` (trim, one space, matched
without case, a record keeps the first spelling, lists show the most used); forms refuse a comma (the CSV export joins with ", "), over `MAX_TAG_LENGTH` or
`MAX_TAGS`; stored payloads stay lenient, imports go through `sanitizeTag`. Edited in every record form (`TagInput`:
web `@repo/ui` on base-ui's Combobox, mobile `@repo/ui-native`). `SortedRecordsProvider`'s `tagFilters` (several, all
required, in pick order, session only, AND with vault and category; each dropped once no record of the vault in view
carries it; `toggleTag` / `removeTag` / `clearTags`; `tags` follow the vault filter, selected first, each counted as the
records left if added; a detail chip's `showTag` clears the other filters first) and search's third tier. Search
(`records/record-search.ts`: `parseSearch`, `matchRecords` title → subtitle (a login's email too) → tag with why each matched; a query starting
with `#`, `TAG_SEARCH_PREFIX`, is tag mode) keeps to vault, category and tags; `outsideScope` counts the matches they hide,
`searchAllItems` widens past category and tags until the query or the filters change or tag mode starts (`OutsideScope`, also on phones);
`recentRecords` (session only, search previews excluded); `recentSearches` (text + tags, newest first, once each,
kept when a search opens a record or adds a tag; in memory only and gone on lock, since a query tells which accounts
exist; only those whose tags the vault in view has, `countSearch` counts each there); `searchSections` builds the groups and `useSearchOptions` turns
them into ids + selected state for any search UI; `clearFilters`
drops category and tags, keeping the vault; `listTitle` (mobile app) / `listHeading` (web; the filters show as chips) are shared.
Web desktop: a detail chip sets one, the sidebar's Tags row focuses the search with `#` (`searchTags` via `searchInputRef`);
while the field has focus, `SearchPanel` (`useSearchPanel`, a combobox) replaces the list: scope chips, tags then
records (empty: top tags, recently opened; `#`: tags with checkboxes, Enter toggles, Backspace on the token leaves); the
highlighted record previews once typed or moved by keys (debounced; never on focus or hover), Enter opens it, Esc restores the record open before; the chips under the list heading remove one or Clear all;
web phone: the list keeps `FilterSheet` (category grid + tags; the non-search way to filter), the ones on as
`ActiveFilterChips` under the title, and the dock's search pill opens `MobileSearchOverlay` (`MobileSearch.tsx`), a
full-screen layer with its own history entry (`search-history.ts`). The field sits on top (Cancel next to it), the
scope chips under it (Clear all drops tags and category), then tag rows "+ Filter" and records from
`useSearchOptions`. Empty, it lists recent searches (`recentSearches`, session only; a tap reruns text + tags) and
recently opened; with tags picked and nothing typed, their records instead (`useSearchOptions({ listTagged })`,
"Tagged #a" / "Logins tagged #a"). Picked tags sit as tokens in the field (✕, or Backspace on an empty field, removes
the last). A tag pill bar rides on the keyboard (`pillTags`: selected, matching the text, then by use; it stands in
for the top tags); tapping a pill that matches the typed text turns the text into that tag filter. `#` is tag mode as
on desktop: tags with checkboxes and a bar "N tags · M items", Clear, Show M items (the done key too) back to the
records. Taps never take focus from the field, so typing goes on; dragging the results drops the keyboard; in
landscape the results get the scope row's and pill bar's space. The search key opens a lone match. Back from a record
opened in it (also once moved, or created from it) lands on the same search with the results' scroll, field focused;
Cancel / Back clears the query and restores the filters (tags, category) and the list's scroll it opened with.
Keyboard mechanics (focus in the tap, `--kb-inset`, holding the keyboard over Back): `apps/web/CLAUDE.md`. Mobile app:
the filters sit in the records header menu. Settings → Tags renames (onto another tag merges) or removes one: a new
version per record in one transaction (`RecordRepository.updateMany`), built from the stored head (not the list's copy), records in `read` vaults skipped and counted. `mergeRecord` merges tags
per tag without case.
