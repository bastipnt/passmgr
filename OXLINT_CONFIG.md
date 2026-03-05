# Shared OXLint Configuration

This repository uses a shared base configuration for OXLint across all packages.

## Structure

```
.oxlintrc.base.json          # Base configuration (shared)
├── apps/
│   ├── web/.oxlintrc.json    # Extends base + React plugins
│   ├── server/.oxlintrc.json # Extends base + React + Node env
│   └── mobile/               # Can extend base
└── packages/
    ├── crypto/.oxlintrc.json # Extends base (no React)
    └── ...
```

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
    "oxlint": "^1.43.0"
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

1. Install OXLint: `pnpm add oxlint@^1.43.0 --save-dev`
2. Create `.oxlintrc.json` extending base config
3. Add `"lint": "oxlint --type-aware"` to package.json scripts
4. Run `pnpm lint` to check for issues
5. Fix any warnings/errors

## Benefits

- **Consistency**: All packages use same base rules
- **Maintainability**: Update rules in one place
- **Flexibility**: Each package can add its own rules/plugins
- **Performance**: Type-aware linting catches more issues
