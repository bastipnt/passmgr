import type { ReactNode } from "react";
import styles from "./PublicLayout.module.css";

type PublicLayoutProps = {
  children: ReactNode;
};

export default function PublicLayout({ children }: PublicLayoutProps) {
  return <main className={styles.main}>{children}</main>;
}
