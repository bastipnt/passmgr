import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return <main className="flex min-h-screen flex-col items-center justify-center">{children}</main>;
}
