import { useCallback, type ReactNode, useState, useEffect, type ReactElement } from "react";
import { TiEyeOutline, TiMail, TiDocument, TiTick } from "react-icons/ti";
import { Button } from "./Button";
import { cn } from "../utils/tailwind";

const labelMap: Record<string, { Icon: ReactElement }> = {
  Email: { Icon: <TiMail /> },
};

type EntryListProps = {
  children: ReactNode;
};

function EntryList({ children }: EntryListProps) {
  return <ul className="bg-surface-2 rounded border">{children}</ul>;
}

type EntryListItemProps = {
  label: string;
  value: string;
  setToastMessage: (message: string) => void;
  valueHidden?: boolean;
};

function EntryListItem({ label, value, setToastMessage, valueHidden }: EntryListItemProps) {
  const [showValue, setShowValue] = useState(!valueHidden);

  const copyValue = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setToastMessage(`${label} copied to clipboard`);
  }, [value, label]);

  useEffect(() => {
    setShowValue(!valueHidden);
  }, [value]);

  const Icon = (
    <span className="row-span-2">{label in labelMap ? labelMap[label].Icon : <TiDocument />} </span>
  );

  const isPassword = label === "Password";
  const showActions = !showValue || isPassword;

  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_auto] items-center",
        "hover:bg-surface-4",
        "not-last:border-b",
      )}
    >
      <button
        title="Click to copy"
        className={cn(
          "grid w-full cursor-pointer grid-flow-col grid-cols-[auto_1fr] grid-rows-2 items-center gap-x-4 px-4 py-2 text-left",
          "focus-visible:ring-primary-900 transition-colors focus-visible:ring-2 focus-visible:outline-none",
          "[&_svg]:text-2xl",
        )}
        onClick={copyValue}
      >
        {Icon}
        <small>{label}</small>
        {showValue ? value : "••••••••••••"}
      </button>
      {showActions && (
        <div className="flex flex-row items-center gap-2 px-4">
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
            <span
              className="text-success-content inline-flex h-10 cursor-help flex-row items-center gap-2"
              title="Your password is strong"
            >
              <TiTick className="text-success-content text-xl" />
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
