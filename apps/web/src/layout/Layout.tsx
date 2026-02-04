import type { ReactNode } from "react";
import styles from "./Layout.module.css";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <div className={styles.container}>
        <header className={styles.header}>Header</header>
        <main className={styles.main}>{children}</main>
      </div>
    </>
  );
}
