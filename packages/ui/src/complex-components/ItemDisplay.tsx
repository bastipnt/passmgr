import { Badge } from "@repo/ui/components/Badge";
import { Button } from "@repo/ui/components/Button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/Item";
import { StackedButton } from "@repo/ui/components/StackedButton";
import { cn } from "@repo/ui/lib/utils";
import type { PasswordStrength, PasswordStrengthLevel } from "@repo/util";
import { BadgeCheckIcon, EyeIcon, EyeOffIcon, NotebookIcon, ShieldAlertIcon } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

const HIDDEN_VALUE = "••••••••••••" as const;

/** Set by `ItemDisplayGroup flushOnMobile`; rows style themselves from it. */
const FlushOnMobileContext = createContext(false);

/**
 * Flush rows below `sm`: square corners (the group is no longer a card),
 * a 1.25rem gutter, an inset focus ring (an outer one would be clipped at the
 * screen edge) and a press state instead of hover, which sticks after a tap
 * on touch screens.
 */
const FLUSH_ROW = "max-sm:rounded-none!";
const FLUSH_PRESSABLE =
  "max-sm:rounded-none! max-sm:focus-visible:border-transparent max-sm:focus-visible:ring-2 max-sm:focus-visible:ring-ring/50 max-sm:focus-visible:ring-inset max-sm:hover:bg-transparent max-sm:active:bg-primary/8 max-sm:dark:hover:bg-transparent max-sm:dark:active:bg-foreground/5";

type OnClickEvent = {
  type: "copy" | "toggleHide";
  isHidden?: boolean;
};

const hiddenVariants = ["password", "hidden"] as const;
const itemDisplayVariants = ["default", "noAction", ...hiddenVariants] as const;

const STRENGTH_BADGE_VARIANT: Record<PasswordStrengthLevel, "destructive" | "warning" | "success"> =
  {
    weak: "destructive",
    fair: "warning",
    strong: "success",
    "very-strong": "success",
  };

function StrengthBadge({ strength }: { strength: PasswordStrength }) {
  const isStrong = strength.level === "strong" || strength.level === "very-strong";
  const Icon = isStrong ? BadgeCheckIcon : ShieldAlertIcon;
  return (
    <Badge variant={STRENGTH_BADGE_VARIANT[strength.level]} className="py-0">
      <Icon data-icon="inline-end" />
      {strength.label}
    </Badge>
  );
}

type ItemDisplayProps = {
  title?: string;
  value?: ReactNode;
  onClick: (event: OnClickEvent) => void;
  icon?: ReactNode;
  variant?: (typeof itemDisplayVariants)[number];
  actions?: ReactNode;
  strength?: PasswordStrength;
  /** Re-hide a revealed value after this many ms. `0` keeps it revealed. */
  revealTimeoutMs?: number;
};

function ItemDisplay({
  title = "-",
  onClick,
  icon,
  actions,
  value = "-",
  variant = "default",
  strength,
  revealTimeoutMs = 0,
}: ItemDisplayProps) {
  const flush = useContext(FlushOnMobileContext);
  const [valueHidden, setValueHidden] = useState(true);
  const usesHiddenValue = hiddenVariants.includes(variant as (typeof hiddenVariants)[number]);

  useEffect(() => {
    if (valueHidden || revealTimeoutMs <= 0) return;

    const timer = setTimeout(() => setValueHidden(true), revealTimeoutMs);
    return () => clearTimeout(timer);
  }, [valueHidden, revealTimeoutMs]);

  const ItemInner = (
    <>
      <ItemMedia
        variant="icon"
        className="size-9 rounded-[10px] border border-foreground/10 bg-foreground/[0.03] text-muted-foreground dark:border-white/10"
      >
        {icon ?? <NotebookIcon />}
      </ItemMedia>
      <ItemContent className="w-full overflow-hidden">
        <ItemTitle className="font-normal text-muted-foreground text-xs">
          {title}
          {variant === "password" && strength && <StrengthBadge strength={strength} />}
        </ItemTitle>
        {typeof value === "string" ? (
          <ItemDescription className="overflow-hidden text-ellipsis text-[0.95rem] text-foreground">
            {usesHiddenValue && valueHidden ? HIDDEN_VALUE : value || "-"}
          </ItemDescription>
        ) : (
          <div data-slot="item-description" className="text-left text-[0.95rem] text-foreground">
            {value}
          </div>
        )}
      </ItemContent>
      {actions && <ItemActions>{actions}</ItemActions>}
    </>
  );

  const CopyButton = (
    <Button
      variant="ghost"
      className={cn(
        "h-auto gap-x-2.5 rounded-none group-first:rounded-t-2xl group-last:rounded-b-2xl",
        flush && [FLUSH_PRESSABLE, "max-sm:pl-5!", !usesHiddenValue && "max-sm:pr-5"],
      )}
      onClick={() => onClick({ type: "copy" })}
    >
      {ItemInner}
    </Button>
  );

  function toggleHide() {
    setValueHidden((currentValueHidden) => {
      const newValueHidden = !currentValueHidden;
      onClick({ type: "toggleHide", isHidden: newValueHidden });

      return newValueHidden;
    });
  }

  return (
    <Item
      className={cn(
        "group rounded-none border-0 not-last:border-foreground/8 not-last:border-b first:rounded-t-2xl last:rounded-b-2xl dark:not-last:border-white/8",
        flush && [FLUSH_ROW, variant === "noAction" && "max-sm:px-5"],
      )}
      render={
        usesHiddenValue ? (
          <StackedButton>
            {CopyButton}

            <Button
              variant="ghost"
              className={cn(
                flush &&
                  "max-sm:mr-4! max-sm:active:bg-primary/8 max-sm:hover:bg-transparent max-sm:dark:active:bg-foreground/5 max-sm:dark:hover:bg-transparent",
              )}
              onClick={toggleHide}
            >
              {valueHidden ? <EyeIcon /> : <EyeOffIcon />}
            </Button>
          </StackedButton>
        ) : variant === "noAction" ? (
          <div>{ItemInner}</div>
        ) : (
          CopyButton
        )
      }
    />
  );
}

type ItemDisplayGroupProps = {
  children: ReactNode;
  className?: string;
  /**
   * Below `sm`, drop the card and run the rows edge to edge like a native
   * list. Expects the parent to have a 1rem side gutter, which it bleeds past.
   */
  flushOnMobile?: boolean;
};

function ItemDisplayGroup({ children, className, flushOnMobile }: ItemDisplayGroupProps) {
  return (
    <ItemGroup
      className={cn(
        "gap-0 rounded-2xl border border-foreground/10 bg-white/60 dark:border-white/10 dark:bg-white/3",
        flushOnMobile &&
          "max-sm:-mx-4 max-sm:w-auto max-sm:rounded-none max-sm:border-x-0 max-sm:bg-transparent max-sm:dark:bg-transparent",
        className,
      )}
    >
      <FlushOnMobileContext value={Boolean(flushOnMobile)}>{children}</FlushOnMobileContext>
    </ItemGroup>
  );
}

export { ItemDisplay, ItemDisplayGroup, itemDisplayVariants };
