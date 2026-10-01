import { Children, Fragment, type ReactElement, type ReactNode } from "react";
import { Text, View } from "react-native";

import { cn } from "../../lib/utils";

/** Small uppercase heading above a flush group — web's section `h2`. */
export function SectionHeading({ children, className }: { children: string; className?: string }) {
  return (
    <Text
      className={cn(
        "px-5 font-semibold text-[11px] text-muted-foreground uppercase tracking-[1.3px]",
        className,
      )}
    >
      {children}
    </Text>
  );
}

type SectionGroupProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Edge-to-edge run of rows with hairlines between them and above/below — the
 * shape web's `ItemDisplayGroup flushOnMobile` takes at phone width.
 */
export function SectionGroup({ children, className }: SectionGroupProps) {
  // `toArray` drops nulls and assigns stable keys, so separators keyed off it
  // survive a reorder — `children` here is JSX, not a mapped list.
  const rows = Children.toArray(children) as ReactElement[];

  return (
    <View className={cn("border-foreground/10 border-y dark:border-white/10", className)}>
      {rows.map((row, i) => (
        <Fragment key={row.key}>
          {i > 0 && <View className="h-px bg-foreground/8 dark:bg-white/8" />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

type SectionProps = {
  title?: string;
  children: ReactNode;
  /** Muted line under the group, e.g. dates. */
  footer?: ReactNode;
  className?: string;
};

/** Heading + flush group (+ optional footer). */
export function Section({ title, children, footer, className }: SectionProps) {
  return (
    <View className={cn("gap-2", className)}>
      {title ? <SectionHeading>{title}</SectionHeading> : null}
      <SectionGroup>{children}</SectionGroup>
      {typeof footer === "string" ? (
        <Text className="px-5 text-muted-foreground text-xs">{footer}</Text>
      ) : (
        footer
      )}
    </View>
  );
}
