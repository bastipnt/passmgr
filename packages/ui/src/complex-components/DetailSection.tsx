import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

type DetailSectionProps = {
  title: string;
  icon?: ReactNode;
  count?: number;
  children: ReactNode;
  className?: string;
};

export function DetailSection({ title, icon, count, children, className }: DetailSectionProps) {
  return (
    <section className={cn("flex flex-col", className)}>
      <h2 className="mb-2 flex items-center gap-2.5 font-bold font-display text-[1.0625rem] tracking-[-0.015em]">
        {icon && (
          <span
            aria-hidden
            className="grid size-6.5 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary-text [&_svg]:size-3.5"
          >
            {icon}
          </span>
        )}
        {title}
        {count !== undefined && (
          <span className="font-medium font-sans text-[0.8125rem] text-muted-foreground/70 tracking-normal">
            {count}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}
