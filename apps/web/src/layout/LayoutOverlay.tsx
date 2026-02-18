import type { ReactNode } from "react";
import ButtonLink from "@repo/ui/ButtonLink";
import { TiTimes } from "react-icons/ti";
import styles from "./LayoutOverlay.module.css";

type LayoutOverlayProps = {
  title: string;
  children: ReactNode;
};

export default function LayoutOverlay({ children, title }: LayoutOverlayProps) {
  return (
    <>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <ButtonLink variant="ghost" size="lg" className={styles.closeButton} href="/">
            <TiTimes />
          </ButtonLink>
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </>
  );
}
