import type { ReactNode } from "react";
import styles from "./Layout.module.css";
import { cn } from "@repo/util";
import Entries from "../data-components/Entries";
import { Input } from "@repo/ui/input";
import ButtonLink from "@repo/ui/ButtonLink";
import { TiPlus } from "react-icons/ti";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <div className={styles.container}>
        <header className={cn("gradientBorder", styles.header)}>
          <Input label="Search" hideLabel />
          <ButtonLink href="/new">
            <TiPlus />
            New Item
          </ButtonLink>
        </header>
        <main className={styles.main}>
          <section className={styles.sectionEntries}>
            <Entries />
          </section>
          {children}
        </main>
      </div>
    </>
  );
}
