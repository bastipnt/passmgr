/*
 * Colors that JS needs to read directly. The semantic palette (background,
 * primary, …) is NOT here — it lives in ./theme.css as CSS custom properties,
 * so web and mobile share one definition. Read those at runtime with uniwind's
 * useCSSVariable("--color-primary") on native, or var(--color-primary) on web.
 */

export const BRAND_GRADIENT = {
  from: "#7B5CFF",
  mid: "#4B36D6",
  to: "#3417A8",
} as const;

/** Solid brand violet — the app-mark tile and primary actions. */
export const BRAND_COLOR = "#6E56F5";

export const LEVEL_COLOR = {
  weak: "#f0445a",
  fair: "#ff8a3d",
  strong: "#f5c542",
  "very-strong": "#34d399",
} as const;
