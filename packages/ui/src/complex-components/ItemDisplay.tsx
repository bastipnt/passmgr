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
import { useState, type ReactNode } from "react";

const HIDDEN_VALUE = "••••••••••••" as const;

type OnClickEvent = {
  type: "copy" | "toggleHide";
  isHidden?: boolean;
};

const hiddenVariants = ["password", "hidden"] as const;
const itemDisplayVariants = ["default", "noAction", ...hiddenVariants] as const;

const STRENGTH_BADGE_CLASS: Record<PasswordStrengthLevel, string> = {
  weak: "text-destructive",
  fair: "text-amber-500",
  strong: "text-emerald-500",
  "very-strong": "text-emerald-600",
};

function StrengthBadge({ strength }: { strength: PasswordStrength }) {
  const isStrong = strength.level === "strong" || strength.level === "very-strong";
  const Icon = isStrong ? BadgeCheckIcon : ShieldAlertIcon;
  return (
    <Badge variant="ghost" className={cn("mr-2 py-0", STRENGTH_BADGE_CLASS[strength.level])}>
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
};

function ItemDisplay({
  title = "-",
  onClick,
  icon,
  actions,
  value = "-",
  variant = "default",
  strength,
}: ItemDisplayProps) {
  const [valueHidden, setValueHidden] = useState(true);
  const usesHiddenValue = hiddenVariants.includes(variant as (typeof hiddenVariants)[number]);

  const ItemInner = (
    <>
      <ItemMedia variant="icon">{icon ?? <NotebookIcon />}</ItemMedia>
      <ItemContent className="w-full overflow-hidden">
        <ItemTitle>
          {title}
          {variant === "password" && strength && <StrengthBadge strength={strength} />}
        </ItemTitle>
        {typeof value === "string" ? (
          <ItemDescription className="text-ellipsis overflow-hidden">
            {usesHiddenValue && valueHidden ? HIDDEN_VALUE : value || "-"}
          </ItemDescription>
        ) : (
          <div data-slot="item-description">{value}</div>
        )}
      </ItemContent>
      {actions && <ItemActions>{actions}</ItemActions>}
    </>
  );

  const CopyButton = (
    <Button
      variant="ghost"
      className="h-auto group-last:rounded-b-lg group-first:rounded-t-lg rounded-none gap-x-2.5"
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
      className="last:rounded-b-lg first:rounded-t-lg rounded-none group"
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
};

function ItemDisplayGroup({ children }: ItemDisplayGroupProps) {
  return <ItemGroup className="border rounded-lg gap-0">{children}</ItemGroup>;
}

export { ItemDisplay, ItemDisplayGroup, itemDisplayVariants };
