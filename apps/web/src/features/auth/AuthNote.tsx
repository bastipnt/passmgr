import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

/** Glass info note: neutral (only the icon carries color) or an amber warning. */
export default function AuthNote({
  icon,
  tone = "neutral",
  children,
}: {
  icon: ReactNode;
  tone?: "neutral" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "warning" ? "note" : undefined}
      className={cn(
        "flex gap-3 rounded-xl border px-3.5 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        tone === "neutral"
          ? "border-foreground/10 bg-white/50 dark:border-white/10 dark:bg-white/[0.04]"
          : "border-[#ffb23f]/40 bg-[#ffb23f]/12 text-[#7a4a00] dark:text-[#ffd08a] [&>svg]:text-[#b45f00] dark:[&>svg]:text-[#ffb23f]",
      )}
    >
      {icon}
      <p>{children}</p>
    </div>
  );
}
