import {
  namedReuse,
  type PasswordIssue,
  passwordIssueDetail,
  passwordIssueTitle,
  usePasswordHealth,
  useRecordVault,
} from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { buttonVariants } from "@repo/ui/components/Button";
import { ExternalLink } from "@repo/ui/components/ExternalLink";
import { cn } from "@repo/ui/lib/utils";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, TriangleAlertIcon } from "lucide-react";
import { Fragment, type ReactNode, useId, useReducer } from "react";
import { Link as WouterLink } from "wouter";
import { recordPaths } from "@/app/route-paths";
import { PasswordStrengthMeter } from "@/features/password-generation";

// Module scope so a record shown again keeps its issues open; web lock reloads the page, which clears it.
const expandedRecords = new Set<string>();

function useExpanded(recordId: string) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const toggle = () => {
    if (!expandedRecords.delete(recordId)) expandedRecords.add(recordId);
    rerender();
  };
  return [expandedRecords.has(recordId), toggle] as const;
}

const actionClass = cn(buttonVariants({ variant: "outline", size: "sm" }), "font-semibold");
const inlineLinkClass = "font-semibold text-primary-text hover:underline";

function EditAction({ recordId, children }: { recordId: string; children: ReactNode }) {
  return (
    <WouterLink href={recordPaths.editRecord(recordId)} className={actionClass}>
      {children}
    </WouterLink>
  );
}

function ReusedDetail({ records }: { records: DecryptedRecord[] }) {
  const { named, more } = namedReuse(records);
  return (
    <>
      The same password is saved in{" "}
      {named.map((record, i) => (
        <Fragment key={record.recordId}>
          {i > 0 && ", "}
          <WouterLink href={recordPaths.record(record.recordId)} className={inlineLinkClass}>
            {record.title}
          </WouterLink>
        </Fragment>
      ))}
      {more > 0 && ` +${more}`}
    </>
  );
}

type IssueView = { title: string; detail: ReactNode; action?: ReactNode };

function issueView(issue: PasswordIssue, recordId: string, writable: boolean): IssueView {
  const view = { title: passwordIssueTitle(issue), detail: passwordIssueDetail(issue) };
  const change = writable && <EditAction recordId={recordId}>Change</EditAction>;
  switch (issue.kind) {
    case "breached":
    case "weak":
    case "old":
      return { ...view, action: change };
    case "reused": {
      const [only] = issue.records;
      return {
        ...view,
        detail: <ReusedDetail records={issue.records} />,
        action: issue.records.length === 1 && only && (
          <WouterLink href={recordPaths.record(only.recordId)} className={actionClass}>
            Show
          </WouterLink>
        ),
      };
    }
    case "missing-two-factor":
      return {
        ...view,
        action: issue.site.documentation ? (
          <ExternalLink href={issue.site.documentation} className={cn(actionClass, "no-underline")}>
            Set up
          </ExternalLink>
        ) : (
          writable && <EditAction recordId={recordId}>Add code</EditAction>
        ),
      };
  }
}

function IssueRow({ title, detail, action }: IssueView) {
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <span
        className="grid size-6.5 shrink-0 place-items-center rounded-full bg-warning/15 text-amber-700 dark:text-warning [&_svg]:size-3.5"
        aria-hidden
      >
        <TriangleAlertIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-[0.8rem] text-muted-foreground">{detail}</p>
      </div>
      {action}
    </li>
  );
}

/** Strength, breach result and issues of a login's or Wi-Fi's password, under its row in the detail. */
export function PasswordHealthLine({ record }: { record: DecryptedRecord }) {
  const health = usePasswordHealth(record);
  const { writable } = useRecordVault(record);
  const [expanded, toggle] = useExpanded(record.recordId);
  const issuesId = useId();

  if (!health) return null;
  const { strength, breachCount, issues } = health;
  const open = expanded && issues.length > 0;

  return (
    <div data-slot="password-health" className="border-foreground/8 border-b dark:border-white/8">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5 pb-2.5 text-[0.8rem] text-muted-foreground">
        <PasswordStrengthMeter strength={strength} inline />
        {breachCount === 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground/80">
            <CheckIcon className="size-3.5 text-success" aria-hidden />
            Not breached
          </span>
        )}
        {issues.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={issuesId}
            onClick={toggle}
            className="ml-auto inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-full bg-warning/20 pr-2 pl-1.75 font-semibold text-amber-700 ring-1 ring-warning/25 ring-inset dark:text-warning [&_svg]:size-3.5"
          >
            <TriangleAlertIcon aria-hidden />
            {issues.length} {issues.length === 1 ? "issue" : "issues"}
            {open ? <ChevronUpIcon aria-hidden /> : <ChevronDownIcon aria-hidden />}
          </button>
        )}
      </div>
      {open && (
        <ul
          id={issuesId}
          aria-label="Password issues"
          className="mb-3.5 divide-y divide-warning/25 overflow-hidden rounded-2xl border border-warning/25 bg-warning/7"
        >
          {issues.map((issue) => (
            <IssueRow key={issue.kind} {...issueView(issue, record.recordId, writable)} />
          ))}
        </ul>
      )}
    </div>
  );
}
