#!/usr/bin/env node
// TypeScript 7 (native compiler) for typechecking only. The workspace keeps TypeScript 6
// as `typescript` because Expo, Storybook docgen and cosmiconfig still need its JS API.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("typescript7/package.json"));
await import(pathToFileURL(join(root, "lib/tsc.js")).href);
