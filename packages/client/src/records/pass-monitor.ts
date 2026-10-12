import { type DecryptedRecord, isRecordType } from "@repo/schema";
import { normalize, type PasswordStrength, websiteHost } from "@repo/util";
import { monitoredPassword } from "./password-health";
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

function loginHosts(record: DecryptedRecord): string[] {
  if (!isRecordType(record, "login")) return [];
  return (record.websites ?? []).flatMap(({ value }) => websiteHost(value) ?? []);
}

/** What zxcvbn should treat as known words for this record's password. */
function strengthInputs(record: DecryptedRecord): string[] {
  const username = isRecordType(record, "login") ? record.username : undefined;
  const ssid = isRecordType(record, "wifi") ? record.ssid : undefined;
  return [record.title, username, ssid, ...loginHosts(record)].filter(
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
  if (!strength || (strength.level !== "weak" && strength.level !== "fair")) return undefined;
  return { record, strength };
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
 * Logins for the same account: the same username (case and spacing aside) on a
 * shared website host. Logins chain into one group through any host they share.
 * Without a username nothing says two logins are one account (API tokens, several keys).
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
    const username = normalize(record.username ?? "");
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

/** Passwords unchanged for `OLD_PASSWORD_DAYS` or longer, oldest first. */
export function findOldPasswords(
  records: readonly DecryptedRecord[],
  now = new Date(),
): OldPassword[] {
  return records
    .flatMap((record) => {
      const changedAt = monitoredPassword(record) ? passwordChangedAt(record) : undefined;
      if (!changedAt) return [];
      const ageDays = Math.floor((now.getTime() - Date.parse(changedAt)) / DAY_MS);
      return ageDays >= OLD_PASSWORD_DAYS ? [{ record, changedAt, ageDays }] : [];
    })
    .sort((a, b) => b.ageDays - a.ageDays || byTitle(a.record, b.record));
}

/** "Unchanged for 2 years", in whole years (an old password is a year or older). */
export function passwordAgeLabel(ageDays: number): string {
  const years = Math.max(1, Math.floor(ageDays / 365));
  return `Unchanged for ${years} ${years === 1 ? "year" : "years"}`;
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
