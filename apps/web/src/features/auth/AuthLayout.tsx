import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return <main className="flex flex-col justify-center items-center min-h-screen">{children}</main>;
}
