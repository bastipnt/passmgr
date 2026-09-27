import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

type AuthHeroProps = {
  /** Headline lines; wrap the accent line in `<HeroAccent>`. */
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

/** Multicolor headline line; always on a line of its own. */
export function HeroAccent({ children }: { children: ReactNode }) {
  return <span className="block text-spectrum">{children}</span>;
}

const CHIP_DOT = ["bg-[#ff3d8b]", "bg-[#ffb23f]", "bg-[#2ec5ff]", "bg-[#7a5cff]"];

export function HeroChips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2 max-lg:order-last">
      {items.map((item, i) => (
        <li
          key={item}
          className="flex items-center gap-2 rounded-full border border-foreground/12 bg-white/50 px-3.5 py-1.5 text-sm backdrop-blur-sm dark:border-white/12 dark:bg-white/5"
        >
          <span className={cn("size-1.5 rounded-full", CHIP_DOT[i % CHIP_DOT.length])} />
          {item}
        </li>
      ))}
    </ul>
  );
}

type HeroStep = { title: string; description: string };

/** Numbered explainer cards; desktop only. */
export function HeroSteps({ steps }: { steps: HeroStep[] }) {
  return (
    <ol className="hidden max-w-lg flex-col gap-3 lg:flex">
      {steps.map((step, i) => (
        <li
          key={step.title}
          className="flex gap-4 rounded-2xl border border-foreground/10 bg-white/45 p-4 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04]"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-foreground/12 font-semibold text-sm dark:border-white/14">
            {i + 1}
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold">{step.title}</p>
            <p className="text-muted-foreground text-sm">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
