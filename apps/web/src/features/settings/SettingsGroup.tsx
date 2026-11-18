import { cn } from "@repo/ui/lib/utils";
import { createContext, type ReactNode, use, useId } from "react";
import { useGroupHeading } from "./SettingsPage";

type GroupVariant = "default" | "danger";

const GroupVariantContext = createContext<GroupVariant>("default");

export function useGroupVariant() {
  return use(GroupVariantContext);
}

type SettingsGroupProps = {
  label: string;
  footnote?: ReactNode;
  /** `danger`: red label, and its tappable rows read red ("Leave or delete"). */
  variant?: GroupVariant;
  /** The card is a list named by the label; each child is an `<li>` holding its row. */
  list?: boolean;
  /** `SettingsRow`s, split by hairlines. */
  children: ReactNode;
  className?: string;
};

export function SettingsGroup({
  label,
  footnote,
  variant = "default",
  list = false,
  children,
  className,
}: SettingsGroupProps) {
  const Heading = useGroupHeading();
  const headingId = useId();
  const Card = list ? "ul" : "div";

  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-2", className)}>
      <Heading
        id={headingId}
        className={cn(
          "px-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.06em] max-sm:px-4",
          variant === "danger" && "text-destructive",
        )}
      >
        {label}
      </Heading>
      <Card
        data-slot="settings-card"
        aria-labelledby={list ? headingId : undefined}
        className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card"
      >
        <GroupVariantContext value={variant}>{children}</GroupVariantContext>
      </Card>
      {footnote != null && (
        <p className="px-1 text-[13px] text-muted-foreground leading-4.5 max-sm:px-4">{footnote}</p>
      )}
    </section>
  );
}
