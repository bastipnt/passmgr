/*
 * Colors that JS needs to read directly. The semantic palette (background,
 * primary, …) is NOT here — it lives in ./theme.css as CSS custom properties,
 * so web and mobile share one definition. Read those at runtime with uniwind's
 * useCSSVariable("--color-primary") on native, or var(--color-primary) on web.
 */

/** Solid brand violet — the app-mark tile and primary actions. */
export const BRAND_COLOR = "#6E56F5";

export const LEVEL_COLOR = {
  weak: "#f0445a",
  fair: "#ff8a3d",
  strong: "#f5c542",
  "very-strong": "#34d399",
} as const;

/**
 * The four light-field blobs, in web's `.light-field` order (a–d), and the
 * `text-spectrum` gradient that runs through the same hues.
 */
export const FIELD_COLORS = {
  pink: "#ff3d8b",
  amber: "#ffb23f",
  cyan: "#2ec5ff",
  violet: "#7a5cff",
} as const;
