import Link from "@repo/ui/components/Link";
import { Spinner } from "@repo/ui/components/Spinner";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { passMonitorPaths } from "@/app/route-paths";
import { PanelHeader, PanelTitle } from "@/components/AppShell";

type MonitorPageProps = {
  title: string;
  description: string;
  /** `undefined` while the check runs. */
  count: number | undefined;
  empty: string;
  /** Shown instead of the findings when the check couldn't run. */
  error?: string;
  /** Next to the title. */
  actions?: ReactNode;
  /** Below the description, whatever the findings. */
  status?: ReactNode;
  children: ReactNode;
};

/** A finding page: phones step back with the shell's button, wider screens with this one. */
export function MonitorPage({
  title,
  description,
  count,
  empty,
  error,
  actions,
  status,
  children,
}: MonitorPageProps) {
  return (
    <>
      <PanelHeader>
        <Link
          variant="ghost"
          size="icon"
          href={passMonitorPaths.index}
          aria-label="Back to Pass Monitor"
          className="max-sm:hidden"
        >
          <ArrowLeft />
        </Link>
        <PanelTitle>{title}</PanelTitle>
        {actions}
      </PanelHeader>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className="text-muted-foreground text-sm">{description}</p>
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
      </div>
    </>
  );
}
