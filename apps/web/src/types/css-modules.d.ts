/**
 * TypeScript declarations for CSS modules
 *
 * NOTE: This file provides fallback types for CSS modules.
 * For better type safety, run `pnpm typegen:css` to generate
 * individual .d.ts files for each CSS module.
 *
 * The dev server (`pnpm dev`) will auto-generate types in watch mode.
 */

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
