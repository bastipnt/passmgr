import type { ReactNode } from "react";

/** Neutral glass info note; only the icon carries color. */
export default function AuthNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-foreground/10 bg-white/50 px-3.5 py-3 text-sm dark:border-white/10 dark:bg-white/[0.04] [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0">
      {icon}
      <p>{children}</p>
    </div>
  );
}
