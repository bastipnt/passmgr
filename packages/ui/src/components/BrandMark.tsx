import { cn } from "@repo/ui/lib/utils";

const SHIELD_KEYHOLE =
  "M12 2.6 19.6 5.5v5.9c0 4.8-3.2 8.8-7.6 10.1-4.4-1.3-7.6-5.3-7.6-10.1V5.5zM14.3 9.8a2.3 2.3 0 1 0-3.4 2l-.7 3.9h3.6l-.7-3.9a2.3 2.3 0 0 0 1.2-2z";

/** White shield with a keyhole cut-out on a solid violet tile. Size via `className` (default 36px). */
function BrandMark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="brand-mark"
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[30%] bg-primary text-primary-foreground",
        className,
      )}
      {...props}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" className="size-[74%]">
        <path d={SHIELD_KEYHOLE} />
      </svg>
    </span>
  );
}

/** Brand mark plus the "passmgr" wordmark. */
function BrandLockup({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="brand-lockup"
      className={cn("inline-flex items-center gap-3", className)}
      {...props}
    >
      <BrandMark />
      <span className="font-bold font-display text-xl tracking-[-0.02em]">passmgr</span>
    </span>
  );
}

export { BrandLockup, BrandMark };
