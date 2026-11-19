import { useVaults } from "@repo/client";
import { canWriteVault, type DecryptedRecord } from "@repo/schema";
import { Spinner } from "@repo/ui/components/Spinner";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import type { ReactNode } from "react";

type MonitorPageProps = {
  title: string;
  description: string;
  /** `undefined` while the check runs. */
  count: number | undefined;
  empty: string;
  /** Shown instead of the findings when the check couldn't run. */
  error?: string;
  actions?: ReactNode;
  /** Below the description, whatever the findings. */
  status?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
};

const CHANGE_FOOTNOTE =
  "Change opens the item with the generator ready. The score updates when you save.";

/** "Change opens …", for findings whose rows offer Change: only when one of `records` can be changed. */
export function useChangeFootnote(records: readonly DecryptedRecord[] | undefined) {
  const { getVault } = useVaults();
  return records?.some((record) => {
    const vault = getVault(record.vaultId);
    return !vault || canWriteVault(vault.role);
  })
    ? CHANGE_FOOTNOTE
    : undefined;
}

/** A finding: the right-hand pane on desktop (under the overlay's h1), its own page on a phone. */
export function MonitorPage({
  title,
  description,
  count,
  empty,
  error,
  actions,
  status,
  footnote,
  children,
}: MonitorPageProps) {
  const Title = useIsMobile() ? "h1" : "h2";
  const found = !error && count !== undefined && count > 0;

  return (
    <div className="flex max-w-190 flex-col gap-6 max-sm:gap-7 max-sm:px-6 max-sm:pt-3 max-sm:pb-12">
      <header className="flex items-end gap-4 max-sm:px-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Title className="font-bold font-display text-[30px] leading-9">{title}</Title>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {actions}
      </header>
      {status}
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : count === undefined ? (
        <Spinner aria-label={`Checking ${title.toLowerCase()}`} />
      ) : count === 0 ? (
        <p className="text-sm">{empty}</p>
      ) : (
        children
      )}
      {found && footnote && (
        <p className="text-[13px] text-muted-foreground max-sm:px-4">{footnote}</p>
      )}
    </div>
  );
}

/** The hairline-split card of the findings list and of a finding's rows. */
export const monitorCardClassName =
  "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card";

export function MonitorList({ children }: { children: ReactNode }) {
  return <div className={monitorCardClassName}>{children}</div>;
}
