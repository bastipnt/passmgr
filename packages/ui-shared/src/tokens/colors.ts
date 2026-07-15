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

export const LEVEL_COLOR = {
  weak: "#de4047",
  fair: "#f59e0b",
  strong: "#10b981",
  "very-strong": "#059669",
} as const;
