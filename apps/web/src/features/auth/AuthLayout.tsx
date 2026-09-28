import { ThemeToggle } from "@repo/ui/complex-components/ThemeToggle";
import { BrandLockup } from "@repo/ui/components/BrandMark";
import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

/**
 * Light-field backdrop with a brand bar. Pages render an `AuthHero` and a
 * glass card as their two children, which sit side by side from `lg` up.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <div className="light-field" />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1.5rem)] sm:px-10 lg:pt-10">
        <BrandLockup />
        <ThemeToggle />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-8 px-5 pt-8 pb-[max(env(safe-area-inset-bottom),2rem)] sm:px-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16 lg:py-12">
        {children}
      </main>
    </div>
  );
}
