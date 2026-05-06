// fallow-ignore-file unused-file
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
  const isExternal = target === "_blank";

  return (
    <Button asChild variant={variant} size={size} className={className}>
      {isExternal ? (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
          {children} <ArrowUpRightIcon />
        </a>
      ) : (
        <WouterLink href={href} target={target} {...props}>
          {children}
        </WouterLink>
      )}
    </Button>
  );
}
