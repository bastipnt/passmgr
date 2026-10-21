import { ThemeToggle } from "@repo/ui/complex-components/ThemeToggle";
import { BrandLockup } from "@repo/ui/components/BrandMark";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
  /** Off: below `sm` the page's own top bar takes the brand bar's place. */
  phoneHeader?: boolean;
};

/**
 * Light-field backdrop with a brand bar. A page renders an `AuthHero` and a
 * glass card, side by side from `lg` up, or one column spanning the row
 * (`lg:col-span-full`).
 * Below `sm` it is a top-aligned column: a page can pin a footer with `mt-auto`.
 */
export default function AuthLayout({ children, phoneHeader = true }: AuthLayoutProps) {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <div className="light-field" />
      <header
        className={cn(
          "mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1.5rem)] sm:px-10 lg:pt-10",
          !phoneHeader && "max-sm:hidden",
        )}
      >
        <BrandLockup />
        <ThemeToggle />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-8 px-5 pt-8 pb-[max(env(safe-area-inset-bottom),2rem)] max-sm:flex max-sm:flex-col max-sm:items-stretch max-sm:gap-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16 lg:py-12">
        {children}
      </main>
    </div>
  );
}
