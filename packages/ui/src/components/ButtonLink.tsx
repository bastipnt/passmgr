import { Link, type LinkProps } from "wouter";
import { Button, buttonVariants } from "@repo/ui/components/Button";
import type { VariantProps } from "class-variance-authority";

type ButtonLinkProps = {
  href: string;
  className?: string;
} & Omit<LinkProps, "href" | "to" | "asChild"> &
  VariantProps<typeof buttonVariants>;

export default function ButtonLink({
  className,
  href,
  variant = "default",
  size = "default",
  ...props
}: ButtonLinkProps) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <Link href={href} {...props} />
    </Button>
  );
}
