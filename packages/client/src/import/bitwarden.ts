import {
  type ForeignField,
  type ForeignImport,
  ForeignImportBuilder,
  type ForeignRecord,
  isoDate,
  latestDate,
} from "./foreign-import";

/* Bitwarden's unencrypted JSON export (personal vault or an organisation's). */

type Named = { id: string; name: string };

type BitwardenItem = {
  type: number;
  name?: string;
  notes?: string | null;
  favorite?: boolean;
  folderId?: string | null;
  collectionIds?: string[] | null;
  creationDate?: string;
  revisionDate?: string;
  fields?: { name?: string | null; value?: string | null; type?: number }[] | null;
  passwordHistory?: { lastUsedDate?: string; password?: string }[] | null;
  login?: {
    uris?: { uri?: string | null }[] | null;
    username?: string | null;
    password?: string | null;
    totp?: string | null;
    passwordRevisionDate?: string | null;
    fido2Credentials?: unknown[] | null;
  } | null;
  card?: Record<string, string | null | undefined> | null;
  identity?: Record<string, string | null | undefined> | null;
  sshKey?: { privateKey?: string | null; publicKey?: string | null } | null;
};

export type BitwardenExport = {
  encrypted?: boolean;
  folders?: Named[];
  collections?: Named[];
  items: BitwardenItem[];
};

export function isBitwardenExport(json: unknown): json is BitwardenExport {
  return (
    typeof json === "object" && json !== null && Array.isArray((json as BitwardenExport).items)
  );
}

const LOGIN = 1;
const SECURE_NOTE = 2;
const CARD = 3;
const IDENTITY = 4;
const SSH_KEY = 5;

const HIDDEN_FIELD = 1;
const LINKED_FIELD = 3;

const s = (value: string | null | undefined) => value ?? undefined;

function customFields(item: BitwardenItem): ForeignField[] {
  return (item.fields ?? [])
    .filter((field) => field.type !== LINKED_FIELD)
    .map((field) => ({
      title: field.name ?? "",
      value: field.value ?? "",
      secret: field.type === HIDDEN_FIELD,
    }));
}

/** "01/27" from month "1" / "01" and year "2027" / "27". */
function cardExpiry(month?: string | null, year?: string | null): string | undefined {
  if (!month || !year) return undefined;
  return `${month.padStart(2, "0")}/${year.slice(-2)}`;
}

/** Identity fields with no field here, as custom fields. */
const IDENTITY_EXTRAS: [key: string, title: string, secret?: boolean][] = [
  ["title", "Title"],
  ["middleName", "Middle name"],
  ["company", "Company"],
  ["state", "State"],
  ["username", "Username"],
  ["ssn", "Social security number", true],
  ["passportNumber", "Passport number", true],
  ["licenseNumber", "License number", true],
];

function typed(
  item: BitwardenItem,
): Omit<ForeignRecord, "title" | "note" | "favorite" | "tags"> | undefined {
  const fields = customFields(item);
  switch (item.type) {
    case LOGIN: {
      const login = item.login ?? {};
      return {
        type: "login",
        fields: { username: s(login.username), password: s(login.password), totp: s(login.totp) },
        websites: (login.uris ?? []).map((u) => u.uri ?? ""),
        customFields: fields,
        passwordChangedAt: latestDate([
          isoDate(login.passwordRevisionDate),
          ...(item.passwordHistory ?? []).map((h) => isoDate(h.lastUsedDate)),
        ]),
      };
    }
    case SECURE_NOTE:
      return { type: "note", customFields: fields };
    case CARD: {
      const card = item.card ?? {};
      return {
        type: "card",
        fields: {
          cardholderName: s(card.cardholderName),
          number: s(card.number),
          expiry: cardExpiry(card.expMonth, card.expYear),
          securityCode: s(card.code),
        },
        customFields: [{ title: "Brand", value: card.brand ?? "" }, ...fields],
      };
    }
    case IDENTITY: {
      const id = item.identity ?? {};
      return {
        type: "identity",
        fields: {
          firstName: s(id.firstName),
          lastName: s(id.lastName),
          email: s(id.email),
          phone: s(id.phone),
          street: [id.address1, id.address2, id.address3].filter(Boolean).join("\n"),
          postalCode: s(id.postalCode),
          city: s(id.city),
          country: s(id.country),
        },
        customFields: [
          ...IDENTITY_EXTRAS.map(([key, title, secret]) => ({
            title,
            value: id[key] ?? "",
            secret,
          })),
          ...fields,
        ],
      };
    }
    case SSH_KEY:
      return {
        type: "ssh_key",
        fields: { privateKey: s(item.sshKey?.privateKey), publicKey: s(item.sshKey?.publicKey) },
        customFields: fields,
      };
    default:
      return undefined;
  }
}

/** Folders and collections become tags; earlier passwords and passkeys are left behind. */
export function importBitwarden(file: BitwardenExport): ForeignImport {
  const builder = new ForeignImportBuilder("bitwarden");
  const folders = new Map((file.folders ?? []).map((f) => [f.id, f.name]));
  const collections = new Map((file.collections ?? []).map((c) => [c.id, c.name]));

  for (const item of file.items) {
    const record = typed(item);
    if (!record) {
      builder.skip(item.name ?? "Untitled", "unsupported_type");
      continue;
    }
    const folder = item.folderId ? folders.get(item.folderId) : undefined;
    builder.add({
      ...record,
      title: item.name,
      note: s(item.notes),
      favorite: item.favorite,
      tags: [
        ...(folder ? [folder] : []),
        ...(item.collectionIds ?? []).flatMap((id) => collections.get(id) ?? []),
      ],
      createdAt: isoDate(item.creationDate),
      leftBehind: {
        previousPasswords: item.passwordHistory?.length ?? 0,
        passkeys: item.login?.fido2Credentials?.length ? 1 : 0,
      },
    });
  }
  return builder.build();
}
