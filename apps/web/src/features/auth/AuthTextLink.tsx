import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";
import { Link } from "wouter";

type AuthTextLinkProps = {
  href: string;
  children: ReactNode;
  tone?: "strong" | "muted";
  className?: string;
};

/** Inline underlined link for auth card copy ("Create an account", "Forgot password?"). */
export default function AuthTextLink({
  href,
  tone = "strong",
  className,
  children,
}: AuthTextLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-sm underline decoration-1 underline-offset-4 outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring/25",
        tone === "strong"
          ? "font-semibold text-foreground decoration-foreground/40 hover:decoration-foreground"
          : "text-muted-foreground text-xs decoration-muted-foreground/40 hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}
