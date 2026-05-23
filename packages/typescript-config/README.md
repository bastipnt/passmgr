# @repo/typescript-config

Shared `tsconfig.json` base files for the [passmgr](../../README.md) monorepo.

## Consumers

Every other package and app in the workspace.

## What's in here

- `base.json` — common compiler options (strictness, module resolution, target)
- Per-environment extensions for React, React Native, Node, library builds

## Usage

In a package or app `tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/<variant>.json",
  "compilerOptions": { ... }
}
```
