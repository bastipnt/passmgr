import type { Href } from "expo-router";

/**
 * Every route string in one place, mirroring `apps/web/src/app/route-paths.ts`.
 *
 * It sits at `src/` rather than `src/app/` like web's: expo-router turns every
 * file under `src/app/` into a route, so a constants module there would show
 * up as `/route-paths`.
 *
 * The URLs differ from web's on purpose: they are expo-router's file-based
 * routes (see `src/app/(app)/(records,search)/`), which carry no `/record`
 * prefix. Typed routes are on, so the builders return `Href` rather than
 * `string` — the cast is what a template literal costs.
 */
export const recordPaths = {
  index: "/" as Href,
  search: "/search" as Href,
  settings: "/settings" as Href,

  create: "/new" as Href,
  /** The generator opened from the create sheet. */
  createGeneratePassword: "/generate-password" as Href,

  // ── builders ──
  record: (recordId: string) => `/${recordId}` as Href,
  editRecord: (recordId: string) => `/${recordId}/edit` as Href,
  /** The generator opened from a record's edit sheet. */
  generatePassword: (recordId: string) => `/${recordId}/generate-password` as Href,
  recordVersions: (recordId: string) => `/${recordId}/versions` as Href,
  version: (recordId: string, version: number) => `/${recordId}/versions/${version}` as Href,
} as const;
