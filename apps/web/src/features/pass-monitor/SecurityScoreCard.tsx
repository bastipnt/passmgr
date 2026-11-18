import {
  SECURITY_SCORE_LABEL,
  type SecurityScore,
  type SecurityScoreLevel,
  SKIPPED_CHECK_LABEL,
  securityScoreSummary,
} from "@repo/client";
import { Badge } from "@repo/ui/components/Badge";
import { Meter } from "@repo/ui/components/Meter";
import { Spinner } from "@repo/ui/components/Spinner";
import { cn } from "@repo/ui/lib/utils";

const LEVEL_STYLE: Record<
  SecurityScoreLevel,
  { badge: "success" | "warning" | "destructive"; bar: string }
> = {
  good: { badge: "success", bar: "bg-success" },
  fair: { badge: "warning", bar: "bg-warning" },
  poor: { badge: "destructive", bar: "bg-destructive" },
};

const cardClassName =
  "flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 max-sm:gap-3 max-sm:p-5";

export function SecurityScoreCard({ score }: { score: SecurityScore | undefined }) {
  if (!score) {
    return (
      <div className={cn(cardClassName, "flex-row items-center gap-2 text-muted-foreground")}>
        <Spinner aria-label="Calculating security score" />
        Calculating security score…
      </div>
    );
  }

  if (score.score === null || !score.level) {
    return (
      <div className={cn(cardClassName, "text-muted-foreground")}>
        No passwords to score yet. Logins and Wi-Fi networks with a password count.
      </div>
    );
  }

  const label = SECURITY_SCORE_LABEL[score.level];
  return (
    <div className={cardClassName}>
      <div className="flex items-baseline gap-2">
        <span className="font-bold font-display text-5xl tabular-nums leading-13 max-sm:text-[44px] max-sm:leading-12">
          {score.score}
        </span>
        <span className="text-muted-foreground">/ 100</span>
        <Badge variant={LEVEL_STYLE[score.level].badge} className="ml-auto">
          {label}
        </Badge>
      </div>
      <Meter
        value={score.score}
        aria-label="Security score"
        aria-valuetext={`${score.score} of 100, ${label}`}
        indicatorClassName={LEVEL_STYLE[score.level].bar}
      />
      <p className="text-muted-foreground text-sm">{securityScoreSummary(score)}</p>
      {score.skipped.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Not counted: {score.skipped.map((check) => SKIPPED_CHECK_LABEL[check]).join(", ")}.
        </p>
      )}
    </div>
  );
}
