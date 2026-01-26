import type { ReactNode } from "react";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <div className="grid min-h-screen grid-flow-col grid-cols-[minmax(16rem,auto)_1fr] grid-rows-[auto_1fr_auto]">
        <header className="col-span-2 border-b p-8">Header</header>
        {/* <nav className="z-10 row-span-3 border-r p-8 shadow-lg">Nav</nav> */}
        <main className="col-span-2 row-span-2 grid grid-cols-subgrid">{children}</main>
      </div>
    </>
  );
}
