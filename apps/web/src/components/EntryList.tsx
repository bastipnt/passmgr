import { useCallback, type ReactNode, useState, useEffect } from "react";
import { TiEyeOutline, TiTick } from "react-icons/ti";
import { Button } from "./Button";
import { getAttrsForName } from "../utils/label-mapping";
import styles from "./EntryList.module.css";
import { cn } from "../utils/cn";

type EntryListProps = {
  children: ReactNode;
};

function EntryList({ children }: EntryListProps) {
  return <ul className={cn("gradientBorder", styles.entryList)}>{children}</ul>;
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
    <li className={cn("gradientBorder", styles.item)}>
      <button title="Click to copy" className={styles.contentButton} onClick={copyValue}>
        <span className={styles.iconWrapper}>{Icon}</span>
        <small>{label}</small>
        {showValue ? value : "••••••••••••"}
      </button>
      {showActions && (
        <div className={styles.actions}>
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
            <span className={styles.strongBadge} title="Your password is strong">
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
