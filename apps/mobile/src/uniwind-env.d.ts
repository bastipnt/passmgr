/// <reference types="uniwind/types" />

// Uniwind augments react-native component props with `className` (see
// uniwind/types). The class-name literal unions live in the Metro-generated
// `uniwind-types.d.ts` (dtsFile), picked up via the `src/**/*.ts` tsconfig glob
// once the bundler has run.

declare module "*.css" {}
