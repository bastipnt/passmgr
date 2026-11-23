# Web served-code trust

The web app gets its code from the server every time it loads. Whoever controls that server
controls the code that handles the master password and the vault keys after unlock. Every web
end-to-end encrypted app has this problem. This page describes what the build and release do about
it and what they don't. Implementation: `apps/web/vite-plugin-build-integrity.ts`,
`apps/web/public/sw.js`, `.github/workflows/release.yml` (`web-checksums`),
`apps/web/scripts/verify-deployment.ts`, `.github/workflows/web-served-code.yml`.

## Chain of trust

The browser trusts whatever the host serves as `index.html` and `sw.js`. Every other file is pinned
to those two:

```
index.html ──SRI──► entry JS + CSS + preloaded chunks
sw.js ──SRI per file──► every other precached file (lazy chunks, workers, sqlite wasm, icons)
SHA256SUMS (GitHub release) ──sha256──► the whole build, index.html and sw.js included
```

The service worker installs a version only when every file matches its hash. One bad file fails the
whole install, and the old version stays active.

`SHA256SUMS` is produced by GitHub CI from the released image. It is published on the GitHub release
(`passmgr-web.SHA256SUMS`), not on the web host.

## Checking a deployment

`pnpm --filter web verify:deployment <url> <SHA256SUMS> [Caddyfile]` fetches every file in `SHA256SUMS`
in each encoding Caddy serves (identity, gzip, br) and compares the decoded bytes. It also fetches the
documents a browser can land on, `/` and the SPA fallback (`/login`, `/welcome`, `/create`,
`/settings` and a random path), each of which must be the released `index.html`. A host serving the
genuine `/` but other HTML on deep links fails. It also compares
`Content-Security-Policy`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` with the
values in the release tag's `Caddyfile`, on every response (`sw.js` and the workers take theirs from
their own response), so a dropped or weakened CSP fails too.

`web-served-code.yml` runs it hourly and after each deploy, with the sums and the `Caddyfile` of the
release tag (never from the site), and keeps an issue open while it fails. The script tells two kinds
of failure apart:

- **Mismatch** (exit 1): a file, a fallback route or a pinned header differs, or a file the release
  lists is missing (a 4xx). The issue "Served web code does not match the release" opens at once and
  calls it a possible web-host compromise.
- **Unreachable** (exit 3): only fetches failed (network error, timeout, HTTP 5xx), so nothing was
  compared. The issue "Served-code check could not reach production" opens only after 3 scheduled
  runs failed in a row (about two hours on the hourly cron) and says it is not by itself evidence of
  tampering. A host that keeps failing only some of the release's files still needs explaining.

One mismatch outweighs any number of unreachable files, and a run is a mismatch once every candidate
release mismatched in one of its two attempts. While an issue is open, each failing run of its kind
comments on it instead.

## Images

`release.yml` deploys the images by digest, not by tag. The build job passes the digests it pushed
to the later jobs: `web-checksums` extracts `SHA256SUMS` from that exact web image, and the host runs
`passmgr-<name>:<version>@sha256:…` (`docker-compose.prod.yml`, `infra/deploy/remote-deploy.sh`).
Anything else that can push to GHCR can move a tag, but not what a digest names.

Every image gets signed SLSA build provenance (`actions/attest-build-provenance`, stored in GHCR next
to the image). `web-checksums` checks it before using the image; anyone can do the same:

```bash
gh attestation verify oci://ghcr.io/<owner>/passmgr-web@sha256:… --repo <owner>/<repo> \
  --signer-workflow <owner>/<repo>/.github/workflows/release.yml
```

The provenance says which workflow run built the digest from which commit. It doesn't make the build
trustworthy (see *Supply chain* below). Attestations need a public repository, or GitHub Enterprise
Cloud for a private one.

## What it protects against

| Threat | Effect |
| --- | --- |
| Asset files tampered with while `index.html` is intact: a CDN or cache in front of Caddy, write access to `/assets` only, a TLS-intercepting proxy injecting code | The browser refuses the file instead of running it. A poisoned `immutable` asset (cached for a year) can't persist. |
| A corrupted or mixed set of files in the offline cache | The service worker only ever activates a complete set of files checked against one manifest. |
| A compromised web host, as long as GitHub and CI are not compromised | Detectable: the host can't make the published checksums match its files. `pnpm --filter web verify:deployment <url> <SHA256SUMS>` shows the mismatch. |

## What it does not protect against

- **Full web-host compromise.** The host serves its own `index.html` and `sw.js` with its own hashes.
  Browsers re-check `sw.js` regularly, so a returning user picks up the malicious version at the next
  update. Nothing in the browser compares against the published checksums. This only detects a
  swap, it doesn't prevent it.
- **Targeted attacks.** A malicious host can serve bad code only to one victim (picked by IP or user
  agent) and clean code to everyone else. A check run from anywhere else passes.
- **Supply chain or build compromise.** A malicious dependency or a compromised CI ends up in the
  published hashes too. The checksums pin whatever was built.
- **XSS.** That is the CSP's job (`Caddyfile`, `script-src 'self'`). There is no inline import map
  with hashes, because it would need a hash in the CSP.
- **First visit.** Before the service worker is installed, lazy chunks load without SRI. Only the
  tags in `index.html` are checked.

## Operational constraint

A proxy or CDN that rewrites JS, CSS or HTML breaks the app load and the service worker install:
minifying, injecting scripts (e.g. Cloudflare auto-minify or Rocket Loader), anything that changes
bytes. Compression is fine, because the hashes cover the decoded body.

## Closing the gap

1. **Scheduled monitoring** (done: `web-served-code.yml`, see *Checking a deployment*). Catches
   untargeted swaps of the files, the fallback routes and the security headers.
2. **A client-side verifier.** A browser extension checks `index.html` and `sw.js` against the
   release before the app runs, like Meta's Code Verify. Also catches targeted attacks. It fits the
   planned browser extension.
3. **Reproducible builds.** Third parties rebuild a tag and get the same hashes, so the checksums
   don't rest on trust in CI. Not verified yet; `VITE_SITE_URL` already changes `index.html`.
4. **Signed, installed clients.** A desktop app or Isolated Web App installs signed code once
   instead of fetching it on every load. For high-value vaults the mobile app (store-signed) already
   gives this.
