import type { DecryptedRecord } from "@repo/schema";
import { counted } from "@repo/util";
import type { BreachedPassword } from "./breach-check";
import type {
  InsecureWebsite,
  MissingTwoFactor,
  MonitorGroup,
  OldPassword,
  WeakPassword,
} from "./pass-monitor";

export type SecurityScoreLevel = "good" | "fair" | "poor";

/** A check left out of the score: off, or it couldn't run (fully). */
export type SkippedCheck = "weak" | "breached" | "missingTwoFactor";

export type SecurityScore = {
  /** 0–100; `null` without anything to score. */
  score: number | null;
  level: SecurityScoreLevel | null;
  checked: number;
  atRisk: number;
  skipped: SkippedCheck[];
};

export type SecurityScoreInput = {
  /** Every record with a monitored password. */
  monitored: readonly DecryptedRecord[] | null;
  weak: WeakPassword[] | null;
  weakFailed: boolean;
  reused: MonitorGroup[] | null;
  old: OldPassword[] | null;
  insecure: InsecureWebsite[] | null;
  missingTwoFactor: MissingTwoFactor[] | null;
  twoFactorFailed: boolean;
  breach: {
    /** `null` while the setting loads. */
    enabled: boolean | null;
    /** `null` when off or nothing is known yet. */
    breached: BreachedPassword[] | null;
    checking: boolean;
    failed: boolean;
    offline: boolean;
  };
};

export const SCORE_PENALTY = {
  breached: 1,
  weak: 0.6,
  fair: 0.3,
  reused: 0.5,
  insecure: 0.3,
  old: 0.2,
  missingTwoFactor: 0.2,
} as const;

const GOOD_SCORE = 80;
const FAIR_SCORE = 50;

export function securityScoreLevel(score: number): SecurityScoreLevel {
  return score >= GOOD_SCORE ? "good" : score >= FAIR_SCORE ? "fair" : "poor";
}

/**
 * One score over the pass monitor's findings: each monitored password scores 1 minus
 * its penalties, the score is their mean. Duplicates aren't a risk and don't count;
 * a login without a password has nothing to score. A breached password keeps it below good.
 * `undefined` while a check that counts is still running.
 */
export function securityScore(input: SecurityScoreInput): SecurityScore | undefined {
  const { monitored, weak, reused, old, insecure, missingTwoFactor, breach } = input;
  const { breached } = breach;
  if (!monitored || !reused || !old || !insecure) return undefined;
  if (!weak && !input.weakFailed) return undefined;
  if (!missingTwoFactor && !input.twoFactorFailed) return undefined;
  if (breachPending(breach)) return undefined;

  const penalties = new Map<string, number>(monitored.map(({ recordId }) => [recordId, 0]));
  const add = (record: DecryptedRecord, penalty: number) => {
    const current = penalties.get(record.recordId);
    if (current !== undefined) penalties.set(record.recordId, current + penalty);
  };

  for (const { record, strength } of weak ?? []) {
    add(record, strength.level === "weak" ? SCORE_PENALTY.weak : SCORE_PENALTY.fair);
  }
  for (const group of reused) for (const record of group.records) add(record, SCORE_PENALTY.reused);
  for (const { record } of old) add(record, SCORE_PENALTY.old);
  for (const { record } of insecure) add(record, SCORE_PENALTY.insecure);
  for (const { record } of missingTwoFactor ?? []) add(record, SCORE_PENALTY.missingTwoFactor);
  for (const { record } of breached ?? []) add(record, SCORE_PENALTY.breached);

  const skipped: SkippedCheck[] = [];
  if (!weak) skipped.push("weak");
  if (!breached || breach.failed) skipped.push("breached");
  if (!missingTwoFactor) skipped.push("missingTwoFactor");

  const checked = penalties.size;
  if (checked === 0) return { score: null, level: null, checked, atRisk: 0, skipped };

  let health = 0;
  let atRisk = 0;
  for (const penalty of penalties.values()) {
    // Capped, so a breached password is lost whatever else holds.
    health += 1 - Math.min(1, penalty);
    if (penalty > 0) atRisk++;
  }
  const score = Math.round((health / checked) * 100);
  const level = securityScoreLevel(score);
  return {
    score,
    level: level === "good" && breached?.length ? "fair" : level,
    checked,
    atRisk,
    skipped,
  };
}

// A run publishes results in batches, and an enabled check without results is about to start:
// both would score breached passwords as clean.
function breachPending({
  enabled,
  breached,
  checking,
  failed,
  offline,
}: SecurityScoreInput["breach"]) {
  if (enabled === null) return true;
  return enabled && (checking || (!breached && !failed && !offline));
}

export const SECURITY_SCORE_LABEL: Record<SecurityScoreLevel, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const SKIPPED_CHECK_LABEL: Record<SkippedCheck, string> = {
  weak: "weak passwords",
  breached: "breaches",
  missingTwoFactor: "missing 2FA",
};

const passwords = (n: number) => counted(n, "password", "passwords");

/** "2 of 24 passwords need attention." */
export function securityScoreSummary({ checked, atRisk }: SecurityScore): string {
  if (atRisk === 0) return `No issues found in ${passwords(checked)}.`;
  return `${atRisk} of ${passwords(checked)} ${atRisk === 1 ? "needs" : "need"} attention.`;
}
