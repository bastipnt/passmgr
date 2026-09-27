import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@repo/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-clip-padding font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/25 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Solid violet, no gradient — color is for the light field, not the controls.
        // Light mode gets the depth dark mode has for free: a top highlight, a
        // darker rim and a violet drop.
        default:
          "border-primary-pressed/70 bg-primary/92 text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(58_36_190/0.3),0_8px_18px_-8px_rgb(110_86_245/0.6)] hover:bg-primary-pressed/92 dark:border-transparent dark:bg-primary dark:shadow-none dark:hover:bg-primary-pressed [a]:hover:bg-primary-pressed",
        // Raised: translucent white glass with a lit top edge in light, faint glass in dark.
        outline:
          "border-foreground/8 bg-white/55 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_1px_2px_rgb(22_20_31/0.07),0_4px_12px_-6px_rgb(22_20_31/0.12)] backdrop-blur-md backdrop-saturate-140 hover:bg-white/80 aria-expanded:bg-white/80 dark:border-white/14 dark:bg-white/5 dark:shadow-none dark:backdrop-filter-none dark:aria-expanded:bg-white/10 dark:hover:bg-white/10",
        secondary:
          "border-foreground/8 bg-white/55 text-secondary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_1px_2px_rgb(22_20_31/0.07),0_4px_12px_-6px_rgb(22_20_31/0.12)] backdrop-blur-md backdrop-saturate-140 hover:bg-white/80 aria-expanded:bg-white/80 dark:border-white/14 dark:bg-white/5 dark:shadow-none dark:backdrop-filter-none dark:aria-expanded:bg-white/10 dark:hover:bg-white/10",
        ghost:
          "hover:bg-primary/8 hover:text-foreground aria-expanded:bg-primary/8 aria-expanded:text-foreground dark:aria-expanded:bg-foreground/5 dark:hover:bg-foreground/5",
        "ghost-destructive":
          "text-destructive hover:bg-destructive/10 hover:text-destructive aria-expanded:bg-destructive/30 aria-expanded:text-destructive",
        destructive:
          "border-destructive/16 bg-destructive/9 text-destructive hover:bg-destructive/15 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:border-transparent dark:bg-destructive/15 dark:focus-visible:ring-destructive/40 dark:hover:bg-destructive/25",
        link: "justify-start text-primary underline-offset-4 hover:underline dark:text-ring",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),8px)] px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),10px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-5 font-semibold text-[0.95rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs":
          "size-6 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),8px)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),10px)]",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
