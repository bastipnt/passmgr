import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

type AuthHeroProps = {
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
};

/** Left column of an auth screen: display headline, lead copy, extras. */
export function AuthHero({ title, lead, children }: AuthHeroProps) {
  return (
    <section className="flex flex-col gap-5 lg:gap-7">
      <h1 className="max-w-2xl text-balance font-display font-extrabold text-[2.5rem] leading-[0.95] tracking-[-0.035em] sm:text-6xl xl:text-[4.25rem]">
        {title}
      </h1>
      {lead && <p className="max-w-md text-muted-foreground sm:text-lg">{lead}</p>}
      {children}
    </section>
  );
}

const CHIP_DOT = ["bg-[#ff3d8b]", "bg-[#ffb23f]", "bg-[#2ec5ff]", "bg-[#7a5cff]"];

export function HeroChips({ items, compact = false }: { items: string[]; compact?: boolean }) {
  return (
    <ul
      className={cn(
        "flex flex-wrap gap-2 max-lg:order-last",
        compact && "flex-nowrap justify-center gap-1.5",
      )}
    >
      {items.map((item, i) => (
        <li
          key={item}
          className={cn(
            "flex items-center gap-2 rounded-full border border-foreground/12 bg-white/50 px-3.5 py-1.5 text-sm backdrop-blur-sm dark:border-white/12 dark:bg-white/5",
            compact && "gap-1.5 whitespace-nowrap px-2.5 py-1 text-xs",
          )}
        >
          <span className={cn("size-1.5 rounded-full", CHIP_DOT[i % CHIP_DOT.length])} />
          {item}
        </li>
      ))}
    </ul>
  );
}
