import { type DecryptedRecord, isRecordType } from "@repo/schema";
import { normalize, type PasswordStrength, websiteHost } from "@repo/util";
import { loginHosts } from "./login-hosts";
import { monitoredPassword } from "./password-health";
import { loginAccountName } from "./record-summary";
import {
  type TwoFactorDirectory,
  type TwoFactorSite,
  twoFactorSiteOf,
} from "./two-factor-directory";

export const OLD_PASSWORD_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WeakPassword = { record: DecryptedRecord; strength: PasswordStrength };
export type OldPassword = { record: DecryptedRecord; changedAt: string; ageDays: number };
export type InsecureWebsite = { record: DecryptedRecord; hosts: string[] };
export type MissingTwoFactor = { record: DecryptedRecord; site: TwoFactorSite };
/** Records that share something; `id` is a member's record id, never the shared value. */
export type MonitorGroup = { id: string; records: DecryptedRecord[] };

export type RateStrength = (password: string, userInputs: string[]) => PasswordStrength | null;

const byTitle = (a: DecryptedRecord, b: DecryptedRecord) => a.title.localeCompare(b.title);

/** What zxcvbn should treat as known words for this record's password. */
export function strengthInputs(record: DecryptedRecord): string[] {
  const login = isRecordType(record, "login") ? record : undefined;
  const ssid = isRecordType(record, "wifi") ? record.ssid : undefined;
  return [record.title, login?.username, login?.email, ssid, ...loginHosts(record)].filter(
    (input): input is string => !!input,
  );
}

/** The record's finding when its password rates below strong; `undefined` otherwise or while unrated. */
export function weakPasswordOf(
  record: DecryptedRecord,
  rate: RateStrength,
): WeakPassword | undefined {
  const password = monitoredPassword(record);
  if (!password) return undefined;
  const strength = rate(password, strengthInputs(record));
  return strength && isWeakStrength(strength) ? { record, strength } : undefined;
}

export function isWeakStrength(strength: PasswordStrength): boolean {
  return strength.level === "weak" || strength.level === "fair";
}

/** Weakest first. */
export function sortWeakPasswords(found: WeakPassword[]): WeakPassword[] {
  const rank = (finding: WeakPassword) => (finding.strength.level === "weak" ? 0 : 1);
  return [...found].sort((a, b) => rank(a) - rank(b) || byTitle(a.record, b.record));
}

function toGroups(sets: Iterable<DecryptedRecord[]>): MonitorGroup[] {
  return [...sets]
    .filter((records) => records.length > 1)
    .map((records) => {
      const sorted = [...records].sort(byTitle);
      return { id: sorted[0]!.recordId, records: sorted };
    })
    .sort((a, b) => b.records.length - a.records.length || byTitle(a.records[0]!, b.records[0]!));
}

/** Records holding the exact same password, across vaults and types. */
export function findReusedPasswords(records: readonly DecryptedRecord[]): MonitorGroup[] {
  const byPassword = new Map<string, DecryptedRecord[]>();
  for (const record of records) {
    const password = monitoredPassword(record);
    if (password) byPassword.set(password, [...(byPassword.get(password) ?? []), record]);
  }
  return toGroups(byPassword.values());
}

/**
 * Logins for the same account: the same username, or email without one (case and
 * spacing aside), on a shared website host. Logins chain into one group through any
 * host they share. Without either nothing says two logins are one account (API tokens, several keys).
 */
export function findDuplicateLogins(records: readonly DecryptedRecord[]): MonitorGroup[] {
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const up = parent.get(id) ?? id;
    if (up === id) return id;
    const top = root(up);
    parent.set(id, top);
    return top;
  };

  const firstByAccount = new Map<string, string>();
  const linked = new Set<string>();
  for (const record of records) {
    if (!isRecordType(record, "login")) continue;
    const username = normalize(loginAccountName(record) ?? "");
    if (!username) continue;
    for (const host of new Set(loginHosts(record))) {
      const account = `${username}\n${host}`;
      const first = firstByAccount.get(account);
      if (first === undefined) firstByAccount.set(account, record.recordId);
      else {
        parent.set(root(record.recordId), root(first));
        linked.add(record.recordId).add(first);
      }
    }
  }

  const groups = new Map<string, DecryptedRecord[]>();
  for (const record of records) {
    if (!linked.has(record.recordId)) continue;
    const top = root(record.recordId);
    groups.set(top, [...(groups.get(top) ?? []), record]);
  }
  return toGroups(groups.values());
}

/** When the password was last changed, as far as the record knows. */
export function passwordChangedAt(record: DecryptedRecord): string | undefined {
  const stamped = (record as { passwordChangedAt?: string }).passwordChangedAt;
  return stamped ?? record.firstCreatedAt ?? undefined;
}

/** The record's finding when its password is unchanged for `OLD_PASSWORD_DAYS` or longer. */
export function oldPasswordOf(record: DecryptedRecord, now = new Date()): OldPassword | undefined {
  const changedAt = monitoredPassword(record) ? passwordChangedAt(record) : undefined;
  if (!changedAt) return undefined;
  const ageDays = Math.floor((now.getTime() - Date.parse(changedAt)) / DAY_MS);
  return ageDays >= OLD_PASSWORD_DAYS ? { record, changedAt, ageDays } : undefined;
}

/** Passwords unchanged for `OLD_PASSWORD_DAYS` or longer, oldest first. */
export function findOldPasswords(
  records: readonly DecryptedRecord[],
  now = new Date(),
): OldPassword[] {
  return records
    .flatMap((record) => oldPasswordOf(record, now) ?? [])
    .sort((a, b) => b.ageDays - a.ageDays || byTitle(a.record, b.record));
}

/** "Last changed 14 months ago": months under two years, whole years after. */
export function passwordLastChangedLabel(ageDays: number): string {
  const months = Math.round((ageDays * 12) / 365);
  if (months < 24) return `Last changed ${months} ${months === 1 ? "month" : "months"} ago`;
  return `Last changed ${Math.floor(months / 12)} years ago`;
}

// Loopback traffic never leaves the device, so plain HTTP there exposes nothing.
const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

/** Logins with a website on plain `http://`, by title. */
export function findInsecureWebsites(records: readonly DecryptedRecord[]): InsecureWebsite[] {
  return records
    .flatMap((record) => {
      if (!isRecordType(record, "login")) return [];
      const hosts = (record.websites ?? []).flatMap(({ value }) => {
        const url = value.trim();
        if (!url.toLowerCase().startsWith("http://")) return [];
        const host = websiteHost(url);
        return host && !LOOPBACK_HOST.test(host) ? [host] : [];
      });
      return hosts.length > 0 ? [{ record, hosts: [...new Set(hosts)] }] : [];
    })
    .sort((a, b) => byTitle(a.record, b.record));
}

/** The 2FA-capable site of a login with a password, unless it already holds a TOTP secret. */
export function missingTwoFactorOf(
  record: DecryptedRecord,
  directory: TwoFactorDirectory,
): TwoFactorSite | undefined {
  if (!isRecordType(record, "login") || record.totp || !monitoredPassword(record)) return undefined;
  for (const host of loginHosts(record)) {
    const site = twoFactorSiteOf(host, directory);
    if (site) return site;
  }
  return undefined;
}

/** Logins for sites that offer TOTP but have none saved, by title. */
export function findMissingTwoFactor(
  records: readonly DecryptedRecord[],
  directory: TwoFactorDirectory,
): MissingTwoFactor[] {
  return records
    .flatMap((record) => {
      const site = missingTwoFactorOf(record, directory);
      return site ? [{ record, site }] : [];
    })
    .sort((a, b) => byTitle(a.record, b.record));
}

/** How many records a list of groups holds; `undefined` while it isn't known. */
export function groupedCount(groups: readonly MonitorGroup[] | null): number | undefined {
  return groups?.reduce((sum, group) => sum + group.records.length, 0);
}

export type PassMonitorIssues = {
  weak: readonly unknown[] | null;
  reused: readonly MonitorGroup[] | null;
  old: readonly unknown[] | null;
  insecure: readonly unknown[] | null;
  missingTwoFactor: readonly unknown[] | null;
  breached: readonly unknown[] | null;
};

/**
 * The Pass Monitor overview's counts summed, duplicates aside (two copies of one
 * account aren't a weakness). A check not known yet, or known in part, counts
 * what is known, so the total only grows as checks finish.
 */
export function passMonitorIssueCount(issues: PassMonitorIssues): number {
  return (
    (issues.weak?.length ?? 0) +
    (groupedCount(issues.reused) ?? 0) +
    (issues.old?.length ?? 0) +
    (issues.insecure?.length ?? 0) +
    (issues.missingTwoFactor?.length ?? 0) +
    (issues.breached?.length ?? 0)
  );
}
