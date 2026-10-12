import { pwnedPasswordHash } from "@repo/crypto";
import type { DecryptedRecord } from "@repo/schema";
import { type BreachCheck, type BreachCheckVersion, breachCheckKey } from "@repo/store";
import { monitoredPassword } from "./password-health";

export const PWNED_RANGE_URL = "https://api.pwnedpasswords.com/range/";
export const BREACH_RECHECK_DAYS = 30;
export const BREACH_CHECK_CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BreachedPassword = { record: DecryptedRecord; count: number };

export class RangeRequestError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(status: number, retryAfterMs?: number) {
    super(`Breach check request failed (${status})`);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export type FetchRange = (prefix: string, signal?: AbortSignal) => Promise<string>;

/** One HIBP range request. Padding hides how many suffixes share the prefix. */
export const fetchPwnedRange: FetchRange = async (prefix, signal) => {
  const response = await fetch(PWNED_RANGE_URL + prefix, {
    headers: { "Add-Padding": "true" },
    signal,
  });
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new RangeRequestError(
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }
  return await response.text();
};

/** suffix → count of a range response; padding rows (count 0) are left out. */
export function parseRangeResponse(body: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of body.split("\n")) {
    const [suffix, count] = line.trim().split(":");
    const n = Number(count);
    if (suffix && Number.isSafeInteger(n) && n > 0) counts.set(suffix.toUpperCase(), n);
  }
  return counts;
}

export const breachVersion = ({
  recordId,
  version,
  clientUpdatedAt,
}: DecryptedRecord | BreachCheck): BreachCheckVersion => ({ recordId, version, clientUpdatedAt });

export function isBreachCheckStale(
  check: Pick<BreachCheck, "checkedAt">,
  now = new Date(),
): boolean {
  return now.getTime() - Date.parse(check.checkedAt) >= BREACH_RECHECK_DAYS * DAY_MS;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

type CountBreachesOptions = {
  fetchRange?: FetchRange;
  signal?: AbortSignal;
  concurrency?: number;
  /** Called with each prefix's results: record version key → count. */
  onResult?: (counts: Map<string, number>) => void;
  backoffMs?: (attempt: number) => number;
};

/**
 * How often each record's password appears in known breaches, by version key.
 * One request per distinct hash prefix; a prefix that keeps failing leaves its
 * records out of the result. Rejects when aborted (or when `onResult` throws).
 */
export async function countBreaches(
  records: readonly DecryptedRecord[],
  {
    fetchRange = fetchPwnedRange,
    signal,
    concurrency = BREACH_CHECK_CONCURRENCY,
    onResult,
    backoffMs = (attempt) => 1000 * 2 ** attempt,
  }: CountBreachesOptions = {},
): Promise<Map<string, number>> {
  const byPrefix = new Map<string, { key: string; suffix: string }[]>();
  for (const record of records) {
    const password = monitoredPassword(record);
    if (!password) continue;
    const { prefix, suffix } = pwnedPasswordHash(password);
    const key = breachCheckKey(record);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), { key, suffix }]);
  }

  const results = new Map<string, number>();
  const queue = [...byPrefix.entries()];

  const fetchWithRetry = async (prefix: string) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchRange(prefix, signal);
      } catch (error) {
        signal?.throwIfAborted();
        const rateLimited = error instanceof RangeRequestError && error.status === 429;
        if (!rateLimited || attempt + 1 >= MAX_ATTEMPTS) throw error;
        await sleep(error.retryAfterMs ?? backoffMs(attempt), signal);
      }
    }
  };

  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [prefix, entries] = next;
      let body: string;
      try {
        body = await fetchWithRetry(prefix);
      } catch (error) {
        signal?.throwIfAborted();
        console.warn("Breach check request failed", error);
        continue;
      }
      const counts = parseRangeResponse(body);
      const found = new Map(entries.map(({ key, suffix }) => [key, counts.get(suffix) ?? 0]));
      for (const [key, count] of found) results.set(key, count);
      onResult?.(found);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return results;
}

/** Records whose current password was found in a breach, most often found first. */
export function findBreachedPasswords(
  records: readonly DecryptedRecord[],
  checks: ReadonlyMap<string, BreachCheck>,
): BreachedPassword[] {
  return records
    .flatMap((record) => {
      if (!monitoredPassword(record)) return [];
      const check = checks.get(breachCheckKey(record));
      return check && check.count > 0 ? [{ record, count: check.count }] : [];
    })
    .sort((a, b) => b.count - a.count || a.record.title.localeCompare(b.record.title));
}

/** HIBP counts how often a password was seen in breaches, not in how many. */
export function breachCountLabel(count: number): string {
  return `Seen ${count.toLocaleString("en")} ${count === 1 ? "time" : "times"} in data breaches`;
}
