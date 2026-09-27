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
import { type ReactNode, useEffect, useState } from "react";

const HIDDEN_VALUE = "••••••••••••" as const;

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
      className="h-auto gap-x-2.5 rounded-none group-first:rounded-t-2xl group-last:rounded-b-2xl"
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
      className="group rounded-none first:rounded-t-2xl last:rounded-b-2xl"
      render={
        usesHiddenValue ? (
          <StackedButton>
            {CopyButton}

            <Button variant="ghost" onClick={toggleHide}>
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
};

function ItemDisplayGroup({ children, className }: ItemDisplayGroupProps) {
  return (
    <ItemGroup
      className={cn(
        "gap-0 divide-y divide-foreground/8 rounded-2xl border border-foreground/10 bg-white/60 dark:divide-white/8 dark:border-white/10 dark:bg-white/[0.03]",
        className,
      )}
    >
      {children}
    </ItemGroup>
  );
}

export { ItemDisplay, ItemDisplayGroup, itemDisplayVariants };
