# Editor setup

## Tailwind IntelliSense

Two Tailwind v4 entry points live in this monorepo: `packages/ui/src/styles/globals.css` (web) and
`apps/mobile/src/global.css` (mobile). Without an explicit map the Tailwind extension auto-detects both and serves
whichever it found first, so mobile-only tokens (`--spacing-md`, px-based `--text-*`) leak into web files and vice
versa.

`tailwindCSS.experimental.configFile` in `.vscode/settings.json` fixes that. Its keys are the entry CSS files, its
values are globs (relative to the workspace root) of the files that resolve against that entry.

Once the setting exists, files matched by no glob get no IntelliSense at all: add a new UI directory to the matching
glob list.
