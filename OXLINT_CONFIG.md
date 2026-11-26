# Shared OXLint Configuration

This repository uses a shared base configuration for OXLint across all packages.

## Structure

```
.oxlintrc.base.json          # Base configuration (shared)
├── apps/
│   ├── web/.oxlintrc.json        # Extends base + jsx-a11y, react
│   ├── server/.oxlintrc.json     # Extends base
│   └── mobile/.oxlintrc.json     # Extends base + react
└── packages/
    ├── client/.oxlintrc.json     # Extends base + jsx-a11y, react
    ├── crypto/.oxlintrc.json     # Extends base
    ├── db/.oxlintrc.json         # Extends base
    ├── schema/.oxlintrc.json     # Extends base
    ├── store/.oxlintrc.json      # Extends base
    ├── types/.oxlintrc.json      # Extends base
    ├── ui/.oxlintrc.json         # Extends base + jsx-a11y, react
    ├── ui-native/.oxlintrc.json  # Extends base + react
    ├── ui-shared/.oxlintrc.json  # Extends base
    └── util/.oxlintrc.json       # Extends base
```

`packages/typescript-config` has no config and no `lint` script: it holds only tsconfig JSON and the
`tsc7` launcher. `infra/redis` (`@repo/redis`) has no config and no `lint` script either: it holds only
a Docker Compose file. React Native packages (`apps/mobile`, `packages/ui-native`) skip `jsx-a11y`: its
rules check DOM elements and ARIA attributes, which React Native doesn't render.

## Base Configuration

The base config (`.oxlintrc.base.json` in root) includes:

- **Plugins**: import, typescript, unicorn, eslint, oxc
- **Environment**: browser + node
- **Overrides**: Disables `no-explicit-any` for test files

## Usage

### For library packages (no React)

Create `.oxlintrc.json`:

```json
{
  "$schema": "../../node_modules/oxlint/configuration_schema.json",
  "extends": ["../../.oxlintrc.base.json"]
}
```

### For app packages (with React)

Create `.oxlintrc.json`:

```json
{
  "$schema": "../../node_modules/oxlint/configuration_schema.json",
  "extends": ["../../.oxlintrc.base.json"],
  "plugins": ["jsx-a11y", "react"]
}
```

### Package.json

Add to `scripts`:

```json
{
  "scripts": {
    "lint": "oxlint --type-aware"
  },
  "devDependencies": {
    "oxlint": "catalog:",
    "oxlint-tsgolint": "catalog:"
  }
}
```

## Extending Further

You can override or add rules in your package's config:

```json
{
  "extends": ["../../.oxlintrc.base.json"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "off"
  },
  "overrides": [
    {
      "files": ["*.test.ts"],
      "rules": {
        "no-console": "off"
      }
    }
  ]
}
```

## Running Lint

```bash
# Lint single package
pnpm --filter @repo/crypto lint

# Lint all packages
pnpm lint
```

## Migration Guide

To add OXLint to an existing package:

1. Install OXLint from the workspace catalog: `pnpm add oxlint@catalog: oxlint-tsgolint@catalog: --save-dev`
2. Create `.oxlintrc.json` extending base config
3. Add `"lint": "oxlint --type-aware"` to package.json scripts
4. Run `pnpm lint` to check for issues
5. Fix any warnings/errors

## Benefits

- **Consistency**: All packages use same base rules
- **Maintainability**: Update rules in one place
- **Flexibility**: Each package can add its own rules/plugins
- **Performance**: Type-aware linting catches more issues
