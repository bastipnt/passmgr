import type { ReactNode } from "react";
import { Input } from "@repo/ui/components/Input";
import ButtonLink from "@repo/ui/components/ButtonLink";
import { ThemeToggle } from "@repo/ui/complex-components/ThemeToggle";
import ItemSidebar from "@components/ItemSidebar";
import { PlusIcon } from "lucide-react";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <div className="h-screen grid grid-rows-[auto_1fr] grid-cols-[minmax(10vw,300px)_1fr]">
        <header className="flex flex-row gap-4 content-stretch p-4 border-b col-span-2">
          <Input placeholder="Search..." />
          <ThemeToggle />
          <ButtonLink href="/new">
            <PlusIcon />
            New Item
          </ButtonLink>
        </header>
        <main className="grid grid-cols-subgrid col-span-2 items-stretch overflow-hidden">
          <section className="border-r p-4 overflow-y-scroll">
            <ItemSidebar />
          </section>
          <section className="overflow-y-scroll">{children}</section>
        </main>
      </div>
    </>
  );
}
