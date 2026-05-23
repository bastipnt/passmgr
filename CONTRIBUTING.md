# Contributing to passmgr

Thanks for your interest in helping out.

## Project status

passmgr is an **early prototype**. The architecture, API, and storage format are all subject to change without notice. Expect breaking changes between commits.

Before you sink time into a large contribution, **open an issue first** to discuss the direction.

## Dev setup

See [README.md](./README.md) for the quick start. Short version:

```bash
pnpm install
pnpm db:up        # Postgres + Redis via Docker
pnpm db:migrate
pnpm dev          # all apps in watch mode
```

Required env vars are documented in each app's README.

## Commits

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) and enforces them via commitlint (see `commitlint.config.js`). Pre-push hooks run via Lefthook.

Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `build`, `ci`.

Examples:

- `feat(web): add idle lock timer`
- `fix(crypto): correct HKDF salt length`
- `refactor(server): extract session middleware`

## Code quality gates

Before pushing, make sure these pass:

```bash
pnpm lint          # OXLint (type-aware)
pnpm typecheck     # tsc across the monorepo
pnpm test          # Vitest unit tests
```

Lefthook runs the lint + typecheck gate automatically on `pre-push`.

If you change CSS modules in the web app, regenerate the typings:

```bash
pnpm typegen:css
```

## Code conventions

- **Workspace imports**: use `@repo/*` prefix (e.g. `@repo/crypto`, `@repo/ui`). Each package exposes a barrel `index.ts`.
- **Styling**: Tailwind v4. Conditional classes via `cn()` from `@repo/ui/theme`. Use design tokens (`primary-500`, `surface-3`, `text-primary`) rather than raw colors.
- **Schemas**: shared Zod schemas live in `@repo/schema` and are reused on client + server.
- **Crypto**: do not add ad-hoc crypto in app code. All primitives belong in `@repo/crypto`. Get a second pair of eyes on anything that touches the key hierarchy.
- **Drizzle**: this repo runs a Drizzle 1.0 beta with the `defineRelationsPart` API — that differs from the current stable docs.

For more context on the codebase, see [CLAUDE.md](./CLAUDE.md) and [AGENTS.md](./AGENTS.md). They are written for AI coding assistants but are useful for human contributors too.

## Pull requests

- Keep PRs small and focused. One logical change per PR.
- Link the related issue.
- Fill in the PR template — the checklist exists to save reviewers from chasing the basics.
- Add or update tests when you change behavior.
- Update the relevant README(s) when you change a public interface or setup step.

## Security issues

**Do not open public issues for security problems.** See [SECURITY.md](./SECURITY.md) for the private disclosure path.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](./LICENSE).
