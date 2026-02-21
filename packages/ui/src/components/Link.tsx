import { Link as WouterLink, type LinkProps as WouterLinkProps } from "wouter";
import { Button, buttonVariants } from "@repo/ui/components/Button";
import { type VariantProps } from "class-variance-authority";
import { ArrowUpRightIcon } from "lucide-react";

type LinkProps = {
  href: string;
  className?: string;
} & React.ComponentProps<"a"> &
  Omit<WouterLinkProps, "href" | "to" | "asChild"> &
  VariantProps<typeof buttonVariants>;

// TODO: focus-visible border-ring is not showing correctly on DisplayItems page

export default function Link({
  className,
  href,
  variant = "link",
  size = "default",
  target,
  children,
  ...props
}: LinkProps) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <WouterLink href={href} target={target} {...props}>
        {children}
        {target === "_blank" && (
          <>
            {" "}
            <ArrowUpRightIcon />
          </>
        )}
      </WouterLink>
    </Button>
  );
}
