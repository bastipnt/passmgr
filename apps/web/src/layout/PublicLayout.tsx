import type { ReactNode } from "react";

type PublicLayoutProps = {
  children: ReactNode;
};

export default function PublicLayout({ children }: PublicLayoutProps) {
  return <main className="flex flex-col justify-center items-center min-h-screen">{children}</main>;
}
