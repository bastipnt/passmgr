/**
 * OKLCH lightness / chroma of a hue-tinted avatar tile (an initial, a type icon) per theme.
 * Web reads them as `--avatar-fallback-*` (packages/ui globals.css, test/avatar.test.ts).
 */
export const AVATAR_FALLBACK = {
  light: { bg: { l: 0.92, c: 0.06 }, fg: { l: 0.35, c: 0.12 } },
  dark: { bg: { l: 0.28, c: 0.06 }, fg: { l: 0.85, c: 0.1 } },
} as const;

/** Avatar tile edge and corner radius in px. Web's Tailwind classes are checked against it. */
export const AVATAR_TILE = {
  default: { box: 36, radius: 10 },
  md: { box: 42, radius: 12 },
  lg: { box: 56, radius: 16 },
} as const;

export type AvatarTileSize = keyof typeof AVATAR_TILE;
