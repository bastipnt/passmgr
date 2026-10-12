import { cn } from "@repo/ui/lib/utils";

/** An inline text link to another site, opened in a new tab without an opener. */
export function ExternalLink({ className, ...props }: Omit<React.ComponentProps<"a">, "target">) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={cn("underline hover:text-foreground", className)}
      {...props}
    />
  );
}
