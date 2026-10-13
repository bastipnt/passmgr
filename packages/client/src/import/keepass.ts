import { fromBase64 } from "@repo/util";
import { type ForeignImport, ForeignImportBuilder, isoDate } from "./foreign-import";

/* KeePass 2 / KeePassXC XML export (File → Export → KeePass XML): unencrypted. */

/** The part of a DOM `Element` the parser reads, so any XML parser can stand in for `DOMParser`. */
export type XmlElement = {
  readonly tagName: string;
  readonly children: ArrayLike<XmlElement>;
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
};

/** Parses XML into its root element; web passes `DOMParser`, which React Native lacks. */
export type ParseXml = (text: string) => XmlElement;

export function domParseXml(text: string): XmlElement {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) throw new Error("Invalid XML");
  return document.documentElement;
}

const kids = (element: XmlElement, tag?: string) =>
  Array.from(element.children).filter((child) => !tag || child.tagName === tag);
const child = (element: XmlElement, tag: string) => kids(element, tag)[0];
const text = (element: XmlElement | undefined, tag: string) =>
  (element && child(element, tag)?.textContent) ?? undefined;

const STANDARD_KEYS = new Set(["Title", "UserName", "Password", "URL", "Notes"]);
const TOTP_KEYS = new Set(["otp", "TimeOtp-Secret-Base32"]);

/** KDBX 4 writes times as base64 seconds since 0001-01-01 (little-endian int64); older files as ISO. */
const SECONDS_TO_UNIX_EPOCH = 62_135_596_800;

function keePassTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-/.test(value)) return isoDate(value);
  try {
    const bytes = fromBase64(value);
    if (bytes.length !== 8) return undefined;
    const seconds = new DataView(bytes.buffer, bytes.byteOffset, 8).getBigInt64(0, true);
    return isoDate((Number(seconds) - SECONDS_TO_UNIX_EPOCH) * 1000);
  } catch {
    return undefined;
  }
}

type EntryStrings = Map<string, { value: string; secret: boolean }>;

function entryStrings(entry: XmlElement): EntryStrings {
  const strings: EntryStrings = new Map();
  for (const string of kids(entry, "String")) {
    const key = text(string, "Key");
    const value = child(string, "Value");
    if (!key || !value) continue;
    strings.set(key, {
      value: value.textContent ?? "",
      secret: value.getAttribute("ProtectInMemory") === "True",
    });
  }
  return strings;
}

const modified = (entry: XmlElement) =>
  keePassTime(text(child(entry, "Times"), "LastModificationTime"));

/**
 * When the current password was set: the oldest version from which on it's
 * unchanged. Also how many earlier passwords the history holds.
 */
function passwordDates(entry: XmlElement, password: string) {
  const history = kids(child(entry, "History") ?? entry, "Entry");
  const versions = [...history, entry];
  const passwords = versions.map((version) => entryStrings(version).get("Password")?.value ?? "");
  let since = versions.length - 1;
  while (since > 0 && passwords[since - 1] === password) since--;
  const earlier = new Set(passwords.slice(0, since).filter((p) => p && p !== password));
  return {
    changedAt: since === 0 ? undefined : modified(versions[since]!),
    previousPasswords: earlier.size,
  };
}

export function isKeePassXml(file: string): boolean {
  return /<KeePassFile[\s>]/.test(file.slice(0, 4096));
}

/** Every entry as a login; groups become tags (path joined with "/", the root left out). */
export function importKeePassXml(file: string, parseXml: ParseXml = domParseXml): ForeignImport {
  const builder = new ForeignImportBuilder("keepass");
  const root = parseXml(file);
  const recycleBin = text(child(root, "Meta") ?? root, "RecycleBinUUID");

  const walk = (group: XmlElement, path: string[]) => {
    if (recycleBin && text(group, "UUID") === recycleBin) return;
    for (const entry of kids(group, "Entry")) {
      const strings = entryStrings(entry);
      const get = (key: string) => strings.get(key)?.value;
      const password = get("Password") ?? "";
      const { changedAt, previousPasswords } = passwordDates(entry, password);
      const totpKey = [...strings.keys()].find((key) => TOTP_KEYS.has(key));
      builder.add({
        type: "login",
        title: get("Title"),
        fields: { username: get("UserName"), password, totp: totpKey && get(totpKey) },
        websites: [get("URL") ?? ""],
        note: get("Notes"),
        tags: [
          ...(path.some(Boolean) ? [path.filter(Boolean).join("/")] : []),
          ...(text(entry, "Tags") ?? "").split(/[;,]/),
        ],
        customFields: [...strings]
          .filter(
            ([key]) =>
              !STANDARD_KEYS.has(key) && !TOTP_KEYS.has(key) && !key.startsWith("TimeOtp-"),
          )
          .map(([key, { value, secret }]) => ({ title: key, value, secret })),
        createdAt: keePassTime(text(child(entry, "Times"), "CreationTime")),
        passwordChangedAt: changedAt,
        leftBehind: { previousPasswords, attachments: kids(entry, "Binary").length },
      });
    }
    for (const sub of kids(group, "Group")) walk(sub, [...path, text(sub, "Name") ?? ""]);
  };

  const top = child(child(root, "Root") ?? root, "Group");
  if (!top) throw new Error("No group in the KeePass XML file");
  walk(top, []);
  return builder.build();
}
