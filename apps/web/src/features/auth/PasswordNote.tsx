import { cn } from "@repo/ui/lib/utils";
import { ShieldCheckIcon } from "lucide-react";
import type { ReactNode } from "react";

export default function PasswordNote({
  className,
  children = "Your password never leaves this device",
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-center justify-center gap-1.5 text-muted-foreground text-xs",
        className,
      )}
    >
      <ShieldCheckIcon className="size-3.5" aria-hidden />
      {children}
    </p>
  );
}
