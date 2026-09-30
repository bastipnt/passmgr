/**
 * Text-field surface, mirroring web's `field-styles.ts` (packages/ui): a soft
 * tinted well with a hairline border that lifts to white on focus.
 */
export const fieldSurface =
  "rounded-lg border bg-field text-foreground text-[16px] dark:bg-white/5 focus:bg-white dark:focus:bg-white/8";

export const fieldBorder = (invalid: boolean) =>
  invalid
    ? "border-destructive focus:border-destructive"
    : "border-foreground/12 dark:border-white/14 focus:border-ring";

/** Field label: 14px medium, above the field. */
export const fieldLabel = "font-medium text-foreground text-sm";
