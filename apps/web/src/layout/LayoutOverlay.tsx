import type { ReactNode } from "react";

type LayoutOverlayProps = {
  children: ReactNode;
};

export default function LayoutOverlay({ children }: LayoutOverlayProps) {
  return (
    <>
      <div className="flex flex-col justify-center items-center min-h-screen py-8 px-4">
        <main>{children}</main>
      </div>
    </>
  );
}
