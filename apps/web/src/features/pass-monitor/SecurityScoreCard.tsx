import {
  SECURITY_SCORE_LABEL,
  type SecurityScore,
  type SecurityScoreLevel,
  SKIPPED_CHECK_LABEL,
  securityScoreSummary,
} from "@repo/client";
import { Badge } from "@repo/ui/components/Badge";
import { Card, CardContent } from "@repo/ui/components/Card";
import { Meter } from "@repo/ui/components/Meter";
import { Spinner } from "@repo/ui/components/Spinner";

const LEVEL_STYLE: Record<
  SecurityScoreLevel,
  { badge: "success" | "warning" | "destructive"; bar: string }
> = {
  good: { badge: "success", bar: "bg-success" },
  fair: { badge: "warning", bar: "bg-warning" },
  poor: { badge: "destructive", bar: "bg-destructive" },
};

export function SecurityScoreCard({ score }: { score: SecurityScore | undefined }) {
  if (!score) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-2 text-muted-foreground">
          <Spinner aria-label="Calculating security score" />
          Calculating security score…
        </CardContent>
      </Card>
    );
  }

  if (score.score === null || !score.level) {
    return (
      <Card size="sm">
        <CardContent className="text-muted-foreground">
          No passwords to score yet. Logins and Wi-Fi networks with a password count.
        </CardContent>
      </Card>
    );
  }

  const label = SECURITY_SCORE_LABEL[score.level];
  const style = LEVEL_STYLE[score.level];
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1">
            <span className="font-display font-semibold text-4xl tabular-nums leading-none">
              {score.score}
            </span>
            <span className="text-muted-foreground">/ 100</span>
          </div>
          <Badge variant={style.badge}>{label}</Badge>
        </div>
        <Meter
          value={score.score}
          aria-label="Security score"
          aria-valuetext={`${score.score} of 100, ${label}`}
          indicatorClassName={style.bar}
        />
        <p>{securityScoreSummary(score)}</p>
        {score.skipped.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Not counted: {score.skipped.map((check) => SKIPPED_CHECK_LABEL[check]).join(", ")}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
