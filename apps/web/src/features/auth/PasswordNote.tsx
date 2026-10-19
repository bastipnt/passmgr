import { cn } from "@repo/ui/lib/utils";
import { ShieldCheckIcon } from "lucide-react";

export default function PasswordNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-center justify-center gap-1.5 text-muted-foreground text-xs",
        className,
      )}
    >
      <ShieldCheckIcon className="size-3.5" aria-hidden />
      Your password never leaves this device
    </p>
  );
}
