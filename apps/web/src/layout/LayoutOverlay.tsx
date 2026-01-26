import type { ReactNode } from "react";
import ButtonLink from "../components/ButtonLink";
import { TiTimes } from "react-icons/ti";

type LayoutOverlayProps = {
  title: string;
  children: ReactNode;
};

export default function LayoutOverlay({ children, title }: LayoutOverlayProps) {
  return (
    <>
      <div className="grid min-h-screen grid-flow-col grid-cols-[1fr_minmax(16rem,40rem)_1fr] grid-rows-[auto_1fr_auto] gap-y-4">
        <header className="col-span-3 grid grid-cols-subgrid p-4">
          <h1 className="col-start-2">{title}</h1>
          <ButtonLink
            variant="ghost"
            size="lg"
            className="[&_svg]:text-content-primary justify-self-end"
            href="/"
          >
            <TiTimes />
          </ButtonLink>
        </header>
        <main className="col-start-2 row-span-2 row-start-2 grid grid-cols-subgrid">
          {children}
        </main>
      </div>
    </>
  );
}
