import type { ReactNode } from "react";
import styles from "./Layout.module.css";
import { cn } from "@repo/util";
import Entries from "../data-components/Entries";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <div className={styles.container}>
        <header className={cn("gradientBorder", styles.header)}>Header</header>
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
