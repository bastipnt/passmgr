/**
 * Shared look of floating menus (`DropdownMenu`, `Select`): a frosted
 * `glass-popover` panel whose rows grow to 44px with larger text and icons
 * on phones, so entries stay comfortably tappable.
 */

export const popupClassName =
  "data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 glass-popover scrollbar-rounded z-50 max-h-(--available-height) w-(--anchor-width) min-w-40 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-xl p-1.5 text-popover-foreground outline-none duration-150 data-closed:animate-out data-open:animate-in max-sm:min-w-52 max-sm:rounded-2xl";

export const popupItemClassName =
  "relative flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-hidden transition-colors focus:bg-primary/8 focus:text-foreground data-disabled:pointer-events-none data-inset:pl-8 data-disabled:opacity-50 max-sm:min-h-11 max-sm:gap-3 max-sm:rounded-xl max-sm:px-3 max-sm:text-base max-sm:data-inset:pl-11 dark:focus:bg-white/8 [&_svg:not([class*='size-'])]:size-4 max-sm:[&_svg:not([class*='size-'])]:size-5 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/** Rows with a trailing check (checkbox, radio, select option). */
export const popupCheckableItemClassName = `${popupItemClassName} pr-8 max-sm:pr-11`;

export const popupIndicatorClassName =
  "pointer-events-none absolute right-2.5 flex items-center justify-center max-sm:right-3";

export const popupLabelClassName =
  "px-2.5 py-1.5 font-medium text-muted-foreground text-xs data-inset:pl-8 max-sm:px-3 max-sm:text-sm max-sm:data-inset:pl-11";

export const popupSeparatorClassName = "-mx-1.5 my-1.5 h-px bg-foreground/8 dark:bg-white/10";
