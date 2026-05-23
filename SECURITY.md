# Security Policy

passmgr is a password manager. Security reports are taken seriously even though the project is in an early, unaudited state.

## Reporting a vulnerability

**Do not open a public GitHub issue.** Report privately by email:

**`bastipnt@posteo.org`**

Please include:

- A description of the issue and its impact.
- Reproduction steps (commands, requests, code snippets).
- Affected component (`apps/web`, `apps/server`, `apps/mobile`, `packages/crypto`, etc.) and the commit hash you tested against.
- Any logs, screenshots, or proof-of-concept code.

If you'd like to encrypt the report, ask in your first message and a PGP key will be shared.

## What to expect

- Acknowledgment within **7 days**, best-effort.
- Coordinated disclosure: please give a reasonable window to ship a fix before publishing details.
- Credit in the release notes once a fix lands, if you want it.

## Project status — read this first

passmgr is an **early prototype**. The cryptographic stack has **not been audited**. Do not store real passwords with it yet.

That said, reports about the following are very welcome:

### In scope

- Flaws in the OPAQUE registration/login flow (`@cloudflare/opaque-ts` usage).
- Issues in the key hierarchy (Argon2id KEK derivation, vault key wrapping, recovery key handling).
- Bugs in HMAC-signed request authentication (replay protection, signature verification — see `apps/server/src/auth/authMiddleware.ts`).
- Plaintext leakage of secrets to the server, logs, or persistent storage on the client.
- Bypasses of `protectedProcedure` on tRPC routes.
- Email encryption / hashing flaws (`packages/crypto`).
- Dependency vulnerabilities with a direct exploit path through this codebase.

### Out of scope

- Misconfiguration of a self-hosted deployment (e.g. running with default secrets, exposing Redis to the public internet).
- Issues that require physical access to an unlocked device.
- Social engineering of project maintainers.
- Findings from automated scanners without a working reproducer.
- Anything that requires modifying the local client first (this is a client-side app — local code is implicitly trusted by its user).

## Known limitations

These are documented gaps, not vulnerabilities:

- No idle lock or auto-relock in the web client.
- No password recovery UI (recovery-key material is stored server-side but no flow consumes it).
- Mobile app currently exposes auth only; no vault operations.
- `OPAQUE_SERVER_SETUP` rotation invalidates every existing registration. This is by design.
