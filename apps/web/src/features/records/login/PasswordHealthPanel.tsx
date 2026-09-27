import { useGetRecords } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { cn } from "@repo/ui/lib/utils";
import { CheckIcon, MinusIcon, TriangleAlertIcon } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { PasswordStrengthMeter } from "@/features/password-generation";
import { getPasswordHealth } from "../password-health";

type Tone = "good" | "warn" | "neutral";

const TONE_ICON: Record<Tone, ReactNode> = {
  good: <CheckIcon />,
  warn: <TriangleAlertIcon />,
  neutral: <MinusIcon />,
};

const TONE_CLASS: Record<Tone, string> = {
  good: "bg-success/12 text-emerald-700 dark:text-strength-very-strong",
  warn: "bg-warning/15 text-amber-700 dark:text-warning",
  neutral: "bg-foreground/8 text-muted-foreground",
};

function HealthRow({ tone, title, detail }: { tone: Tone; title: string; detail: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full [&_svg]:size-3.5",
          TONE_CLASS[tone],
        )}
        aria-hidden
      >
        {TONE_ICON[tone]}
      </span>
      <span className="flex-1 font-semibold text-sm">{title}</span>
      <span className="min-w-0 truncate text-right text-muted-foreground text-sm">{detail}</span>
    </li>
  );
}

function listTitles(records: DecryptedRecord[]) {
  const titles = records.slice(0, 2).map((record) => record.title);
  const rest = records.length - titles.length;
  return rest > 0 ? `${titles.join(", ")} +${rest}` : titles.join(", ");
}

/** Strength, reuse across the vault and 2FA status of a login's password. */
export function PasswordHealthPanel({ record }: { record: DecryptedRecord }) {
  const { records } = useGetRecords();
  const health = useMemo(() => getPasswordHealth(record, records), [record, records]);

  if (!health) return null;

  const strong = health.strength.level === "strong" || health.strength.level === "very-strong";
  const reused = health.reusedIn.length > 0;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-[0.12em]">
        Password health
      </h2>
      <ul className="divide-y divide-foreground/8 rounded-2xl border border-foreground/10 bg-white/60 dark:divide-white/8 dark:border-white/10 dark:bg-white/[0.03]">
        <HealthRow
          tone={strong ? "good" : "warn"}
          title={`${health.strength.label} password`}
          detail={
            <PasswordStrengthMeter password={record.password ?? ""} compact className="ml-auto" />
          }
        />
        <HealthRow
          tone={reused ? "warn" : "good"}
          title={reused ? "Reused" : "Not reused"}
          detail={
            reused
              ? `Also used by ${listTitles(health.reusedIn)}`
              : `Unique across ${health.checkedCount} ${health.checkedCount === 1 ? "login" : "logins"}`
          }
        />
        <HealthRow
          tone={health.hasTotp ? "good" : "neutral"}
          title={health.hasTotp ? "2FA enabled" : "No 2FA"}
          detail={health.hasTotp ? "TOTP" : "Add a TOTP secret when editing"}
        />
      </ul>
    </section>
  );
}
