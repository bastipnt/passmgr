import { useCallback, type ReactNode, useState, useEffect } from "react";
import { TiEyeOutline, TiTick } from "react-icons/ti";
import { getAttrsForName } from "../utils/label-mapping";
import { cn } from "@repo/util";
import { Button } from "@repo/ui/components/Button";

type EntryListProps = {
  children: ReactNode;
};

function EntryList({ children }: EntryListProps) {
  return <ul className={cn("gradientBorder")}>{children}</ul>;
}

type EntryListItemProps = {
  name: string;
  value?: string;
  setToastMessage: (message: string) => void;
  valueHidden?: boolean;
};

function EntryListItem({ name, value, setToastMessage, valueHidden }: EntryListItemProps) {
  const [showValue, setShowValue] = useState(!valueHidden);
  const { Icon, label } = getAttrsForName(name);

  const copyValue = useCallback(async () => {
    await navigator.clipboard.writeText(value ?? "");
    setToastMessage(`${label} copied to clipboard`);
  }, [value, label, setToastMessage]);

  useEffect(() => {
    setShowValue(!valueHidden);
  }, [valueHidden, setShowValue]);

  const isPassword = label === "Password";
  const showActions = !showValue || isPassword;

  return (
    <li className={cn("gradientBorder")}>
      <button title="Click to copy" onClick={copyValue}>
        <span>{Icon}</span>
        <small>{label}</small>
        {showValue ? value : "••••••••••••"}
      </button>
      {showActions && (
        <div>
          {!showValue && (
            <Button
              onClick={() => setShowValue(true)}
              title={`Show ${label}`}
              variant="ghost"
              size="lg"
            >
              <TiEyeOutline />
            </Button>
          )}
          {isPassword && (
            <span title="Your password is strong">
              <TiTick />
              Strong
            </span>
          )}
        </div>
      )}
    </li>
  );
}

EntryList.Item = EntryListItem;
export default EntryList;
