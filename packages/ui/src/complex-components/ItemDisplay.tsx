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
import { BadgeCheckIcon, EyeIcon, EyeOffIcon, NotebookIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

const HIDDEN_VALUE = "••••••••••••" as const;

type OnClickEvent = {
  type: "copy" | "toggleHide";
  isHidden?: boolean;
};

const hiddenVariants = ["password", "hidden"] as const;
const itemDisplayVariants = ["default", ...hiddenVariants] as const;

type ItemDisplayProps = {
  title: string;
  value?: string;
  onClick: (event: OnClickEvent) => void;
  icon?: ReactNode;
  variant?: (typeof itemDisplayVariants)[number];
  actions?: ReactNode;
};

function ItemDisplay({
  title,
  onClick,
  icon,
  actions,
  value = "-",
  variant = "default",
}: ItemDisplayProps) {
  const [valueHidden, setValueHidden] = useState(true);
  const usesHiddenValue = hiddenVariants.includes(variant as (typeof hiddenVariants)[number]);

  const CopyButton = (
    <Button
      variant="ghost"
      className="h-auto group-last:rounded-b-lg group-first:rounded-t-lg rounded-none gap-x-2.5"
      onClick={() => onClick({ type: "copy" })}
    >
      <ItemMedia variant="icon">{icon ?? <NotebookIcon />}</ItemMedia>
      <ItemContent>
        <ItemTitle>
          {title}
          {variant === "password" && (
            <Badge variant="link" className="mr-2 py-0">
              <BadgeCheckIcon data-icon="inline-end" />
              Strong
            </Badge>
          )}
        </ItemTitle>
        <ItemDescription>{usesHiddenValue && valueHidden ? HIDDEN_VALUE : value}</ItemDescription>
      </ItemContent>
      {actions && <ItemActions>{actions}</ItemActions>}
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
    <Item className="last:rounded-b-lg first:rounded-t-lg rounded-none group" asChild>
      {usesHiddenValue ? (
        <StackedButton>
          {CopyButton}

          <Button variant="ghost" onClick={toggleHide}>
            {valueHidden ? <EyeIcon /> : <EyeOffIcon />}
          </Button>
        </StackedButton>
      ) : (
        CopyButton
      )}
    </Item>
  );
}

type ItemDisplayGroupProps = {
  children: ReactNode;
};

function ItemDisplayGroup({ children }: ItemDisplayGroupProps) {
  return <ItemGroup className="col-start-2 border rounded-lg gap-0">{children}</ItemGroup>;
}

export { ItemDisplay, ItemDisplayGroup, itemDisplayVariants };
