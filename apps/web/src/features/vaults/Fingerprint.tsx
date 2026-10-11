import { cn } from "@repo/ui/lib/utils";

/** A public key's fingerprint (six groups of five digits), to compare out of band. */
export function Fingerprint({ value, className }: { value: string; className?: string }) {
  return (
    <code
      className={cn(
        "block rounded-lg bg-foreground/5 px-3 py-2 text-center font-mono text-sm tracking-wider",
        className,
      )}
    >
      {value}
    </code>
  );
}
