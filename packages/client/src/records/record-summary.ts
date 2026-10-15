import type { RecordData } from "@repo/schema";
import { parseWebsite } from "@repo/util";

/**
 * The one-line secondary text of a record in lists and search: what tells two
 * records with similar titles apart. Never a secret. A card's last four digits
 * are shown (and searchable) on purpose, although the detail view hides the
 * number: they are printed in the clear on receipts and statements anyway, and
 * are how people tell their cards apart. Don't widen this to the full number.
 */
export function getRecordSubtitle(record: RecordData): string | undefined {
  switch (record.type) {
    case "login":
      return record.username || undefined;
    case "card": {
      const digits = record.number?.replace(/\D/g, "") ?? "";
      return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : undefined;
    }
    case "identity":
      return (
        [record.firstName, record.lastName].filter(Boolean).join(" ") || record.email || undefined
      );
    case "api_key":
      return record.host || record.keyId || undefined;
    case "wifi":
      return record.ssid || undefined;
    case "note":
    case "ssh_key":
      return undefined;
  }
}

/** A record's websites (only logins have any), for icons and "open website". */
export function getRecordWebsites(record: RecordData): { value: string }[] | undefined {
  return record.type === "login" ? record.websites : undefined;
}

/** The first website that opens in a browser (http(s)), for "open website"; `host` keeps the port. */
export function getPrimaryWebsite(record: RecordData): { url: string; host: string } | undefined {
  for (const { value } of getRecordWebsites(record) ?? []) {
    const website = parseWebsite(value);
    if (website?.kind === "web") {
      return { url: website.url, host: new URL(website.url).host.replace(/^www\./, "") };
    }
  }
  return undefined;
}

/** "1 item" / "3 items": a count of records, for labels. */
export function itemCount(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}
