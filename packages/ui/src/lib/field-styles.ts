/**
 * Shared surface of form fields (`Input`, `Textarea`, `SelectTrigger`): a
 * light recessed well that turns white with a soft ring on focus, and faint
 * glass in dark mode. Size and padding stay with each component.
 */
export const fieldClassName =
  "rounded-lg border border-foreground/12 bg-field text-base shadow-[inset_0_1px_2px_rgb(22_20_31/0.06)] outline-none transition-[color,background-color,border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/50 aria-invalid:bg-white aria-invalid:ring-4 aria-invalid:ring-destructive/10 md:text-sm dark:border-white/14 dark:bg-white/5 dark:shadow-none dark:aria-invalid:border-destructive/45 dark:aria-invalid:bg-white/5 dark:focus-visible:bg-white/5 dark:focus-visible:ring-ring/20";

/**
 * The boxed field's frame: a hairline border with the accent on focus. Focus comes from
 * the control inside, or from the box itself when it is the control (a select trigger,
 * also while open); `data-invalid` wins over focus.
 */
export const fieldBoxFrameClassName =
  "group/field-box rounded-[13px] border border-foreground/12 outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/16 aria-expanded:border-primary aria-expanded:ring-4 aria-expanded:ring-primary/16 disabled:cursor-not-allowed disabled:opacity-50 has-[[data-slot=field-box-control]:disabled]:cursor-not-allowed has-[[data-slot=field-box-control]:disabled]:opacity-50 has-[[data-slot=field-box-control]:focus-visible]:border-primary has-[[data-slot=field-box-control]:focus-visible]:ring-4 has-[[data-slot=field-box-control]:focus-visible]:ring-primary/16 data-[invalid=true]:border-destructive! data-[invalid=true]:ring-4 data-[invalid=true]:ring-destructive/16! dark:border-white/14";

/** The boxed, label-inside field (`FieldBox`): a white box in the frame. */
export const fieldBoxClassName = `${fieldBoxFrameClassName} flex min-h-15 w-full items-center gap-1.5 bg-card py-[9px] pr-2 pl-3.5 text-left`;

/** Masks a text input until focused, without `type="password"` (no save-password prompt). */
export const maskedTextClassName =
  "[-webkit-text-security:disc] focus:[-webkit-text-security:none]";

/** Blurs text until focused; the shape stays readable, the characters don't. */
export const blurredTextClassName =
  "select-none text-transparent [text-shadow:0_0_7px_color-mix(in_oklab,var(--color-foreground)_55%,transparent)] focus:select-auto focus:text-foreground focus:[text-shadow:none]";
