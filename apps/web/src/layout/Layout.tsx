import type { ReactNode } from "react";
import styles from "./Layout.module.css";
import { cn } from "../utils/cn";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <div className={styles.container}>
        <header className={cn("gradientBorder", styles.header)}>Header</header>
        <main className={styles.main}>{children}</main>
      </div>
    </>
  );
}
