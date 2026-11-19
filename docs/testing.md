# Bulletproof Testing Strategy — passmgr

## Context

`passmgr` is a zero-knowledge OPAQUE password manager. Its correctness IS its security: a single off-by-one in HMAC signing, a timestamp window bug, a missed nonce reuse, or a leaky key wipe can compromise every user vault.

Layers 1 and 2 are implemented. After review the unit layer drifted into heavy mocking (`ioredis-mock`, a `cryptoMockFactory` that stubbed `genPasswordKek` to skip Argon2id, a `wipe` spy that replaced the real function) and large parts of it duplicated the integration layer with weaker guarantees. The strategy below is the slimmed version: pure-function units stay, mocked router/handshake units are removed, the surviving server-side units share the same testcontainers Postgres+Redis as integration, and Argon2id is the only thing we tune for speed — via a module-level setter, not a mock.

## Test philosophy

1. **Prefer real services over mocks.** Real Postgres + Redis + OPAQUE + crypto by default. The only sanctioned tuning is swapping Argon2id parameters to a CI-friendly cost (see "Argon2id in tests"). If a test needs to mock anything else, that is a smell — bias toward moving the assertion into the integration layer.
2. **Unit tests cover only what integration can't.** Pure functions (crypto primitives, Zod schemas, password/TOTP generators), AEAD tampering edge cases that need byte-level control, the secrets-store state machine, and HMAC non-malleability fuzz. Everything that requires Redis, Postgres, or OPAQUE state belongs in `apps/server/test/integration/`.
3. **No duplicate assertions across layers.** When integration proves something end-to-end, the unit test for the same property is deleted, not "kept for safety". The integration test is the source of truth.
4. **A few good integration tests beat many unit tests.** Coverage targets below are measured from the integration suite for the auth + client flows; unit coverage is enforced only where unit tests genuinely own the behaviour.

## Goals (in priority order)

1. Prove every crypto primitive matches its spec and resists tampering, wrong-key, replay.
2. Prove the OPAQUE handshake works end-to-end and the server learns nothing it shouldn't.
3. Prove HMAC request signing rejects every malformed/expired/replayed/forged request.
4. Prove key material (passwordKEK, vaultKey, recoveryKey, sessionKey) is wiped after use — assertions verify bytes are zero, not that a spy was called.
5. Prove schema validators reject malformed inputs and accept all valid edge cases.
6. Prove no plaintext secret (password, recoveryKey, vaultKey) ever crosses the client → server boundary.
7. Lock the above with CI gates so regressions can't merge.

## Argon2id in tests

Argon2id derivation costs ~250 ms/call at production parameters (`{ t: 3, m: 128 * 1024, p: 1 }`), which dominates integration-suite runtime. The mitigation is a module-level mutable default in `packages/crypto/src/hash.ts`, exposed via `setPasswordKekParams(params)` / `getPasswordKekParams()`. Test setup files call the setter once at boot:

```ts
// apps/server/test/setup/argon2-fast.ts
import { setPasswordKekParams } from "@repo/crypto";
setPasswordKekParams({ t: 1, m: 8, p: 1 });
```

This file is wired into `apps/server/vitest.config.ts` and `apps/server/vitest.integration.config.ts` via `setupFiles`. Production code paths are unchanged — the prod default lives in the same file and is what `getPasswordKekParams()` returns when no setter has been called. `retrievePRK` keeps its explicit-params signature because it must round-trip whatever parameters were stored at registration time.

There is **no `vi.mock("@repo/crypto", ...)` anywhere in the codebase.** The earlier `apps/server/test/setup/crypto-mock.ts` factory existed solely to skip Argon2 cost and is deleted.

## Layers

### Layer 1 — Unit tests (Vitest)

Test runner: Vitest 4.x. Unit tests live in two narrow buckets: pure-function packages (no mocks, no I/O) and a handful of server-side edge-case tests that exercise branches the integration layer can't reach. The surviving server units share the testcontainers Postgres+Redis spun up by `apps/server/test/setup/global-setup.ts` rather than running their own `ioredis-mock`.

**`packages/crypto/test/`** — pure-function suite, zero mocks

- `encryption.test.ts` — XChaCha round-trip, AAD mismatch failure, `encryptEmail` round-trip + nonce uniqueness.
- `hash.test.ts` — HKDF determinism + label distinctness, HMAC sign/verify, `hashEmail` keyed-hash distinctness, Argon2 with prod params (3 s timeout), `wipe` smoke.
- `password-generator.test.ts` — length/charset honoured, no biased modulo (distribution check), passphrase draws from EFF wordlist (7 776 entries), `estimateEntropy` math, reject zero-length.
- `totp.test.ts` — RFC 6238 known-answer vectors, base32 normalization, ±30 s window drift, short-secret rejection.
- `biometric.test.ts` — WebAuthn PRF fake authenticator, enrollment + auth round-trip, missing-PRF and user-cancel error paths.
- `wipe.test.ts` — buffer is zeroed in place; `genSalt`/`genKey` randomness sanity.
- `utils.test.ts` — `normalize()`, `getMessage()` composition, HKDF info-label byte sequences.
- `fuzz.test.ts` — fast-check round-trip of XChaCha + HKDF + HMAC + password generation.

**`packages/schema/test/`** — pure Zod, zero mocks

- `user/key-schema.test.ts` — Argon2id bounds, base64 exact-length validation (fast-check on off-by-one lengths), recovery-key + merged-userKey schemas.
- `user/login-schema.test.ts`, `user/registration-schema.test.ts` — RFC 5322 email accept/reject corpus, `authSalt` length, registration vs login symmetry.
- `login-record-schema.test.ts` — title/website/extra-field validation.

**`packages/store/src/secrets-store.test.ts`** — state machine, real `wipe`

The previous version mocked `wipe()` itself, which meant assertions only proved a spy was called. The slimmed version uses the real `wipe` and asserts directly on buffer bytes via a test-only inspection hook on `secretsStore` (not exported from the package barrel):

```ts
expect(sessionSecretBuf.every((b) => b === 0)).toBe(true);
```

Coverage retained: `unlockSession`/`unlockVault` guards, signRequest guards, encrypt/decrypt record round-trip, `lock()` idempotence + buffer zeroing for sessionSecret, authKey, authSalt, vaultKey, concurrent-unlock race, password helpers.

**`apps/server/src/auth/auth-middleware.test.ts`** — HMAC edge cases + non-malleability fuzz, on real Redis

Runs in the integration Vitest config so it shares the testcontainers Redis with `replay-protection.int.test.ts`. The nonce-replay describe block (previously duplicated against `ioredis-mock`) is deleted — `replay-protection.int.test.ts` owns that property. Surviving cases:

- Happy path: valid signature + fresh timestamp → pass.
- Missing-header table (sessionId / timestamp / signature / nonce each independently missing) → 401.
- Timestamp ±6 min out of window → 401.
- Unknown sessionId (not in Redis) → 401.
- Signature computed for a different path / type / input body → 401.
- Single-byte signature flip → 401.
- Stored `rawAuthKey` ≠ signer's key → 401.
- Throws `TRPCError`, not a generic `Error`.
- fast-check: any single-char substitution in any signed header breaks verification.
- fast-check: any single-bit flip in the request body breaks verification.

**Server router edge-case tests** — only what integration doesn't cover

These tests use the real testcontainers Postgres + Redis (no `crypto-mock.ts`, no `ioredis-mock`). Everything else previously in these files has been removed because `opaque-flow.int.test.ts`, `email-encryption.int.test.ts`, and `session-lifecycle.int.test.ts` already prove it end-to-end.

- `apps/server/src/auth/login-router.test.ts`
  - `startLogin` with an unknown user → 401.
  - Wrong password at `finishLogin` → 401.
  - Malformed input → Zod 400 (one representative case; rest in schema tests).
- `apps/server/src/auth/registration-router.test.ts`
  - `REGISTRATION_DISABLED` env flag → 403.
  - Duplicate-email registration surfaces as a typed tRPC error (not a raw Postgres unique-violation 500).
  - Malformed `userKeys` → Zod 400 (one representative case).
- `apps/server/src/record/router.test.ts`
  - Unauthenticated call → 401 smoke test only. CRUD round-trip lives in `apps/server/test/integration/record.int.test.ts`.

**`packages/client/test/`** — node environment, no React

The suite runs in Vitest's `node` environment, so its coverage (`packages/client/vitest.config.ts`) only counts what
it can own: the pure record helpers (`src/records/`), the account flows (`src/account/`), registration
(`src/register.ts`) and `SyncManager`. The hooks and providers need a React environment: the web component tests
(Layer 3, e.g. `apps/web/src/features/auth/use-recovery.test.tsx`) and E2E cover them.

**Deleted from Layer 1**

- `packages/client/src/register.test.ts` and `packages/client/src/login.test.ts` — they mocked `@repo/crypto` and the tRPC caller, duplicating `opaque-flow.int.test.ts`. The one assertion that was uniquely valuable (recoveryKey + password never appear in any outbound tRPC payload) moves to `apps/server/test/integration/no-secret-leak.int.test.ts`, where it runs against the real client crypto.
- `apps/server/test/setup/crypto-mock.ts` — replaced by Argon2 fast-params setup.
- `packages/client/test/fixtures/trpc-from-caller.ts` — no remaining consumers after the deletions above.

### Layer 2 — Integration tests (Vitest, real Postgres + Redis)

Location: `apps/server/test/integration/`. Spun up with **testcontainers-node** so CI gets ephemeral Postgres 16 + Redis 7 per run. Drizzle migrations run against the container before each suite. `apps/server/src/auth/auth-middleware.test.ts` and the slimmed router edge-case tests share the same containers via `apps/server/test/setup/global-setup.ts`, so the only "unit" tests that hit Redis are running against the real service.

- `opaque-flow.int.test.ts` — full registration then login using the real client crypto + real server; assert the server's stored `registrationRecord` decrypts the same vaultKey twice (password path + recovery path) and only with the right inputs. **Adds:** the two stored encrypted vaultKey rows must use distinct nonces (assertion moved here from the deleted client unit test).
- `replay-protection.int.test.ts` — capture a valid request, replay verbatim → 401 once timestamp ages past 5 min; replay within window → rejected once the nonce has been claimed.
  - **FIXED 2026-05-18:** A per-request `x-nonce` header (UUIDv4) was added; the nonce is part of the HMAC-signed message (`getMessage` in `packages/crypto/src/util/general.ts`). The server claims the nonce atomically via `claimNonce` in `apps/server/src/util/redis-utils.ts` (`SET nonce:<n> 1 NX EX 360`). The 6-minute TTL outlives the ±5-minute timestamp window so a stale-timestamp replay always loses to `checkTimestamp` before the nonce check, and an in-window replay loses to the nonce check. This file is now the sole owner of nonce-replay coverage — the duplicate `auth-middleware.test.ts` block has been deleted.
- `session-lifecycle.int.test.ts` — login → use session → 24 h TTL, simulate Redis flush mid-session → next call rejected, two logins create isolated sessions.
- `email-encryption.int.test.ts` — same email registered twice via different clients → second insert blocked by `emailHash` unique index; encrypted columns differ across registrations (nonce/salt random); fresh nonce + ciphertext entropy per call; `hashEmail` determinism.
- `no-secret-leak.int.test.ts` *(new)* — captures every outbound tRPC body during a real register + login flow and deep-greps for the plaintext password and the recoveryKey hex. Asserts neither string ever appears in any captured payload. This is the migrated, more authoritative version of the assertion that previously lived in `packages/client/src/register.test.ts` against a mocked tRPC caller.
- `record.int.test.ts` *(new)* — CRUD round-trip on records for an authenticated session (signed requests). Replaces the colocated `apps/server/src/record/router.test.ts` happy-path coverage.
- `device-login.int.test.ts` — device login (web biometric unlock): a WebAuthn credential registered by a fresh password login logs in without the password; nothing that logs in is stored on the device.
- `sharing.int.test.ts` — sharing a vault between accounts: invites sealed to the invitee's public key, accepting, roles, removal / leaving and the rotation that follows, key updates for the members who stay.

### Layer 3 — Web component tests (Vitest + @testing-library/react + jsdom)

Location: `apps/web/src/**/*.test.tsx`. Use **MSW** (`msw`) to mock tRPC HTTP layer. Already allowed by `pnpm.onlyBuiltDependencies`.

- `features/auth/components/LoginForm.test.tsx` — submit happy path, server error renders without leaking password, password input is `type=password`, autocomplete attrs correct.
- `features/auth/pages/RegisterPage.test.tsx` — recovery key is shown exactly once, "I have saved it" gate required, password strength meter reacts.
- `features/auth/pages/BiometricEnrollPage.test.tsx` — mocks `navigator.credentials`, refuses enrollment if PRF not supported.
- `features/login-record/forms/LoginRecordForm.test.tsx` — secret fields masked, copy-to-clipboard clears after timeout.
- Snapshot tests only for pure presentational components; nothing security-relevant.

### Layer 4 — End-to-end (Playwright)

Location: `apps/web/e2e/`. New `@playwright/test` dev-dep in `apps/web`. Bring up the full stack via `docker-compose` (Postgres + Redis + server) using a dedicated `docker-compose.test.yml`.

- `register-login.e2e.ts` — register a brand-new user, log out, log back in, see vault.
- `recovery.e2e.ts` — register, capture recovery key, simulate forgotten password, recover via recovery key.
- `lock-screen.e2e.ts` — idle timeout locks vault; signRequest fails after lock.
- `csp-headers.e2e.ts` — request `/` and assert CSP, HSTS, X-Frame-Options, COOP/COEP headers present (defends against XSS chain to vault).
- `network-leakage.e2e.ts` — Playwright intercepts every request during register+login; assert no request body or URL contains the user's password, recoveryKey, or vaultKey (string match on captured bodies).

### Layer 5 — Property-based & fuzz (fast-check)

Already used above for schemas. Additional dedicated suites:

- `packages/crypto/test/fuzz.test.ts` — `fc.uint8Array({minLength: 32, maxLength: 32})` for keys, arbitrary plaintexts; round-trip equality; ciphertext ≠ plaintext; ciphertext entropy check (chi-square over 10 000 outputs).
- `apps/server/test/fuzz/trpc-inputs.fuzz.test.ts` — generate arbitrary JSON for each tRPC procedure input; assert validator either accepts and the handler does not throw uncaught, or rejects with a typed Zod error — never a 500.

### Layer 6 — Mutation testing (Stryker)

`@stryker-mutator/core` + `@stryker-mutator/vitest-runner` are installed at root. Stryker's `vitest-runner` takes one vitest config per Stryker run, and the security-critical mutate targets span **two** vitest configs (crypto + store run under their package-local unit configs; auth + client `register/login` run under `apps/server/vitest.integration.config.ts`). Layer 6 therefore uses **four Stryker configs**, one per mutate scope:

| Stryker config                  | Vitest config used                              | Mutated paths                                                | Target score |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------ |
| `stryker.crypto.config.mjs`     | `packages/crypto/vitest.config.ts`              | `packages/crypto/src/**/*.ts` (minus `wordlist-eff-large.ts`, `services/**`, `workers/**`) | 90 |
| `stryker.store.config.mjs`      | `packages/store/vitest.config.ts`               | `packages/store/src/secrets-store.ts`                        | 85 |
| `stryker.server-auth.config.mjs`| `apps/server/vitest.integration.config.ts`      | `apps/server/src/auth/**/*.ts` (minus `*.test.ts`)           | 90 |
| `stryker.client.config.mjs`     | `apps/server/vitest.integration.config.ts`      | `packages/client/src/register.ts`, `packages/client/src/login.ts` | 85 |

All four share `thresholds: { high: 95, low: 85, break: 80 }`, `coverageAnalysis: "perTest"`, `disableTypeChecks: true` (TS 6.0.3 outside the version range of `@stryker-mutator/typescript-checker`; runtime test signal suffices), and write HTML + JSON reports to `reports/mutation/<target>/`. The two integration-runner configs set `concurrency: 2` because each Stryker worker spawns its own Postgres + Redis pair via `apps/server/test/setup/global-setup.ts`.

Root scripts: `pnpm stryker:crypto`, `pnpm stryker:store`, `pnpm stryker:server-auth`, `pnpm stryker:client`.

Run nightly via `.github/workflows/nightly-mutation.yml` (cron `0 3 * * *`, GitHub Actions matrix across the four targets), not on every PR (5–15 min per target × 4 targets is too slow for PRs). Each matrix job uploads its `reports/mutation/<target>/` directory as a build artifact. Mutation scores are informational on PRs; a nightly run fails (and notifies via GitHub's default cron-failure email) when the `break` threshold is missed.

### Layer 7 — Supply-chain & static security

CI split across `.github/workflows/ci.yml` (audit) and `.github/workflows/security.yml`
(scanners, weekly cron + on every PR/push to `main`):

- `pnpm audit --prod --audit-level=high` (in `ci.yml`) — fail on high/critical CVEs.
- **Kingfisher** (`mongodb/kingfisher`, vendored install) — live-secret detection
  on the working tree, uploads SARIF to GitHub code scanning. Picked over
  `gitleaks-action` because Kingfisher validates secrets against issuing
  services (fewer false positives) and its SARIF integrates with the same
  Security tab. Pre-commit secret detection still runs locally via the
  Lefthook `gitleaks protect --staged` hook.
- **Semgrep** (`returntocorp/semgrep` container) with `p/owasp-top-ten` +
  `p/javascript` + `p/typescript` rule packs.
- **OSV Scanner** (`google/osv-scanner-action`) — covers the pnpm lockfile,
  `--fail-on-severity=HIGH`.
- **CodeQL** — *not enabled*. GitHub-hosted CodeQL is unavailable on private
  repos outside a GitHub organisation account. Re-enable the commented-out
  job in `security.yml` if/when the repo moves to an org.

### Layer 8 — DB constraint tests *(implemented 2026-05-20)*

Location: `packages/db/test/`. Own testcontainers Postgres 16 per run, migrations applied at `globalSetup`, `beforeEach` truncates via `TRUNCATE ... RESTART IDENTITY CASCADE`. Wired into `vitest.workspace.ts`.

- `test/constraints/users-unique.test.ts` — re-insert with duplicate `encryptedEmail` / `emailHash` / `registrationRecord` → expect Postgres `23505`.
- `test/constraints/keys-unique.test.ts` — re-insert with duplicate `recoveryKekSalt`, `passwordKekSalt`, `encryptedVaultKey`, `vaultKeyEncryptionNonce`, `encryptedVaultKeyRecovery`, `vaultKeyEncryptionNonceRecovery` → expect `23505`.
- `test/constraints/records-unique.test.ts` — duplicate `(recordId, version)` → `23505`. Distinct version OK. (recordId is currently globally unique per version — confirmed not per-user.)
- `test/constraints/foreign-keys.test.ts` — orphan insert into `keys`/`records` with unknown `userId` → expect `23503`. Delete a `users` row with dependents → `keys` + `records` cascade-delete to zero rows. **Schema change accompanying this layer:** `keys.userId` and `records.userId` now `REFERENCES users(userId) ON DELETE CASCADE`. The `defineRelationsPart(usersKeysRelations, …)` was moved from `src/schema/users.ts` to `src/relations.ts` to break the module import cycle the FK callbacks introduced. Migration: `drizzle/20260520124554_add_user_fks/migration.sql`.
- `test/migrations/drift.test.ts` — shells out to `bunx drizzle-kit generate --config drizzle.config.ts --name=drift-check` and asserts stdout matches `/No schema changes, nothing to migrate/`; cleans up any emitted dir on failure. Catches schema/snapshot divergence.
- `test/migrations/roundtrip.test.ts` — `DROP SCHEMA public CASCADE`, re-apply every `drizzle/*/migration.sql` in order, assert all three tables exist. Guards a single migration file from rotting in isolation.

## Tooling & files to add

| File / dir                                                | Purpose                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `vitest.workspace.ts` (root)                              | Aggregate per-package Vitest configs so `pnpm test` runs all suites uniformly.       |
| `vitest.config.ts` per workspace                          | Coverage thresholds, jsdom for web, node for server, includes/excludes.              |
| `apps/server/test/setup/argon2-fast.ts`                   | One-line `setPasswordKekParams({ t:1, m:8, p:1 })` boot hook — replaces `crypto-mock.ts`. |
| `apps/server/test/integration/no-secret-leak.int.test.ts` | Captures every outbound tRPC body during register+login, asserts no plaintext password / recoveryKey appears. |
| `apps/server/test/integration/record.int.test.ts`         | Signed-request CRUD round-trip for records.                                          |
| `apps/web/e2e/`                                           | Playwright E2E.                                                                      |
| `apps/web/src/test/setup.ts`                              | jsdom + MSW server.                                                                  |
| `docker-compose.test.yml`                                 | E2E test stack.                                                                      |
| `stryker.config.json` (root)                              | Mutation testing config.                                                             |
| `.github/workflows/nightly-mutation.yml`                  | Nightly Stryker run.                                                                 |
| `.github/workflows/security.yml`                          | Kingfisher + Semgrep + OSV (CodeQL disabled — private repo).                         |
| `.github/workflows/e2e.yml`                               | Playwright job booting `docker-compose.test.yml`.                                    |

## Files removed in the slim-down

| File                                                | Reason                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/server/test/setup/crypto-mock.ts`             | Only existed to skip Argon2 cost; replaced by `argon2-fast.ts` + module-level setter.    |
| `packages/client/src/register.test.ts`              | Mocked OPAQUE + tRPC; coverage moved to `opaque-flow.int.test.ts` + `no-secret-leak.int.test.ts`. |
| `packages/client/src/login.test.ts`                 | Same as above.                                                                            |
| `packages/client/test/fixtures/trpc-from-caller.ts` | No remaining consumers.                                                                   |

## Reuse what exists

- Reuse `getMessage()` (already exported from `@repo/crypto`) when constructing test signatures so tests stay aligned with production reconstruction.
- Reuse `@repo/crypto`'s `signHmac` / `verifyHmac` directly in middleware tests instead of hand-rolling HMACs.
- Reuse `apps/server/test/setup/signed-request.ts` (`deriveAuthKey`, `signRequest`) in the trimmed `auth-middleware.test.ts`.
- Reuse `apps/server/test/integration/_helpers.ts` (`register`, `loginAndGetAuthKey`, `callSigned`) in the new `no-secret-leak.int.test.ts`, `record.int.test.ts`, and in any router edge-case test that needs an authenticated session.
- `apps/server/test/setup/global-setup.ts` is shared between the unit and integration vitest configs so both run against the same testcontainers Postgres+Redis.
- `lefthook.yml` pre-push runs `pnpm turbo run test --filter=...[origin/main]` so changed packages are tested before push.

## CI gating

`ci.yml` `check` job: install → audit → lint → typecheck →
`pnpm test:coverage` (unit + Layer 3 component + Layer 8 DB constraint suites;
per-package `coverage.thresholds` in each `vitest.config.ts` enforce the
table below — failing a threshold fails the step) →
`pnpm test:integration:coverage` (Layer 2 server integration suite, runs
against testcontainers Postgres + Redis; enforces the
`apps/server/src/auth/**` + client `register`/`login` thresholds) → build.

The server's unit `vitest.config.ts` excludes `test/integration/**`, so the
integration suite needs its own CI step. Both steps run on `ubuntu-latest`
which ships Docker for the testcontainers backend.

`security.yml` runs Kingfisher, Semgrep, and OSV on every PR + push to `main`
plus a weekly cron.

`e2e.yml` boots `docker-compose.test.yml` (handled inside Playwright's
`globalSetup`) and runs the Playwright suite on every PR + push to `main`.

`nightly-mutation.yml` cron at 03:00 UTC, matrix over the four Stryker
targets, uploads `reports/mutation/<target>/` as artifacts.

Branch protection on `main`: require `check`, `e2e`, `security`. Mutation
score artifacts are informational (nightly job, not blocking PRs).

## Coverage thresholds (enforced)

Unit-suite coverage is enforced only on paths that have a real unit-test owner. Coverage of `apps/server/src/auth/**` and the client `register`/`login` flows is enforced against the **integration suite** instead — that's where their behaviour actually lives now.

| Path                                              | Suite       | Lines | Branches | Functions | Mutation |
| ------------------------------------------------- | ----------- | ----- | -------- | --------- | -------- |
| `packages/crypto/src/**`                          | unit        | 95    | 95       | 95        | 90       |
| `packages/schema/src/**`                          | unit        | 95    | 95       | 95        | —        |
| `packages/store/src/secrets-store.ts`             | unit        | 95    | 90       | 95        | 85       |
| `packages/store/src/**` (pkg-level)               | unit        | 80    | 75       | 80        | —        |
| `apps/server/src/auth/**` + client `register`/`login` | integration | 70 | 50       | 70        | 90       |
| `apps/web/src/features/{auth,login-record}/**`    | unit        | 80    | 70       | 80        | —        |

Notes on numbers that drift from the obvious 95/95/95 baseline:

- `secrets-store.ts` branch threshold is 90 because two defensive guards in
  `deriveAuthKey` are unreachable from public callers (`sessionSecret` and
  `authSalt` are always populated together by `unlockSession`). Comment in
  `packages/store/vitest.config.ts`.
- `apps/server/src/auth/**` + client `register`/`login` thresholds track the
  current integration-suite numbers — gates protect against regressions
  below them while leaving headroom for the noisy branches in OPAQUE +
  Redis error paths. Raise as those branches get tightened.
- Mutation scores are still aspirational: enforced by Stryker config
  `thresholds: { high: 95, low: 85, break: 80 }` per target, but only
  nightly.

## Verification

After implementation:

1. `pnpm test` from root — all unit + integration + component suites green.
2. `pnpm test:coverage` from root — per-package coverage reports (HTML + lcov)
   written under each package's `coverage/`. Deliberately weaken a test in
   `auth-middleware.test.ts` and confirm CI fails on the coverage step.
3. `grep -r 'vi.mock("@repo/crypto"' .` returns zero matches.
4. `grep -r 'ioredis-mock' apps/server packages/client` returns zero matches
   (real Redis everywhere on the auth path).
5. Temporarily replace `setPasswordKekParams({t:1,m:8,p:1})` with production
   params in `argon2-fast.ts` — integration suite should still pass, only
   slower. Proves the speed-up is param-only and not masking a correctness
   bug.
6. Add a deliberate leak: temporarily put `recoveryKey` into a request
   payload — `no-secret-leak.int.test.ts` fails.
7. `pnpm --filter web e2e` — Playwright suite green against
   `docker-compose.test.yml`.
8. `pnpm stryker:crypto` (or any of the four targets) — mutation score
   ≥ 85 on configured paths.
9. Push a commit with a validated live secret — Kingfisher fails the
   `security.yml` run; pre-commit `gitleaks protect --staged` catches it
   even earlier.
10. Push a dep with a known high CVE — `pnpm audit` and OSV both fail.
11. Manually replay a captured authenticated request after 6 min — server
    returns 401 (proves integration test reflects reality).

## Out of scope (deferred)

- Mobile (Expo) test suite — revisit when mobile reaches feature parity.
- Load/performance testing (k6) — separate plan when first prod tenants land.
- Penetration test by external party — recommend after Layer 1–4 land.

## Rollout order

Layers 1 and 2 already exist. The remaining work splits into a **slim-down** pass (deletes + de-mocks the current Layer 1 — see "Test philosophy" and the Layer 1 / Layer 2 sections above) followed by the original forward-looking Layers 3–8.

**Slim-down (must land before any new layer):**

1. Refactor Argon2 params: add `setPasswordKekParams` + `getPasswordKekParams` to `packages/crypto/src/hash.ts`, export from the barrel, add `apps/server/test/setup/argon2-fast.ts`, wire into both `vitest.config.ts` files, then delete `apps/server/test/setup/crypto-mock.ts`. Integration suite should pass measurably faster.
2. Unmock `wipe` in `packages/store/src/secrets-store.test.ts`. Add a non-exported `__peekBuffers` (or `exportForTest`) hook on `secretsStore` so the test can assert buffers are byte-zero after `lock()` / `unlockVault`.
3. Trim `apps/server/src/auth/auth-middleware.test.ts` — delete the nonce-replay describe block, switch to the shared testcontainers Redis.
4. Rewrite `login-router.test.ts`, `registration-router.test.ts`, `record/router.test.ts` to the edge-case lists above, on real services.
5. Add `apps/server/test/integration/no-secret-leak.int.test.ts` and `record.int.test.ts`; add the nonce-distinctness assert to `opaque-flow.int.test.ts`; then delete `packages/client/src/register.test.ts`, `packages/client/src/login.test.ts`, and `packages/client/test/fixtures/trpc-from-caller.ts`.
6. Update CI coverage thresholds per the table above.

**Forward (Layers 3–8):**

7. Web component tests with MSW (Layer 3).
8. Playwright E2E + `docker-compose.test.yml` (Layer 4).
9. Property-based & fuzz expansion (Layer 5).
10. Stryker nightly (Layer 6).
11. Supply-chain & static security (Kingfisher + Semgrep + OSV; CodeQL disabled on private repos) (Layer 7).
12. DB constraint tests (Layer 8).
