import { unzipSync } from "fflate";
import {
  type ForeignField,
  type ForeignImport,
  ForeignImportBuilder,
  type ForeignRecord,
  isoDate,
  latestDate,
} from "./foreign-import";

/* 1Password's 1PUX export: a zip whose `export.data` is JSON (accounts → vaults → items). */

type FieldValue = Partial<{
  string: string;
  concealed: string;
  totp: string;
  url: string;
  email: { email_address?: string } | string;
  phone: string;
  date: number;
  monthYear: number;
  creditCardNumber: string;
  creditCardType: string;
  menu: string;
  gender: string;
  address: { street?: string; city?: string; country?: string; zip?: string; state?: string };
  sshKey: { privateKey?: string; metadata?: { publicKey?: string } } | string;
  file: unknown;
}>;

type SectionField = { title?: string; id?: string; value?: FieldValue };

type OnePasswordItem = {
  categoryUuid?: string;
  favIndex?: number;
  createdAt?: number;
  state?: string;
  details?: {
    loginFields?: { value?: string; designation?: string; name?: string; fieldType?: string }[];
    notesPlain?: string;
    password?: string;
    sections?: { title?: string; fields?: SectionField[] }[];
    passwordHistory?: { value?: string; time?: number }[];
    documentAttributes?: unknown;
    passkey?: unknown;
  };
  overview?: { title?: string; url?: string; urls?: { url?: string }[]; tags?: string[] };
};

type OnePasswordExport = {
  accounts?: { vaults?: { attrs?: { name?: string }; items?: OnePasswordItem[] }[] }[];
};

const CATEGORY = {
  login: "001",
  card: "002",
  note: "003",
  identity: "004",
  password: "005",
  document: "006",
  wifi: "109",
  apiKey: "112",
  sshKey: "114",
} as const;

const WIFI_SECURITY: Record<string, string> = {
  none: "none",
  wep: "wep",
  wpa: "wpa",
  wpa2p: "wpa2",
  wpa2e: "wpa2",
  wpa3p: "wpa3",
  wpa3e: "wpa3",
};

const seconds = (value: number | undefined) => (value ? isoDate(value * 1000) : undefined);

/** Every section field as text; `secret` for concealed ones. Files have no text. */
type Field = { id: string; title: string; value: string; secret: boolean; raw: FieldValue };

function fieldText(value: FieldValue): string | undefined {
  if (value.string !== undefined) return value.string;
  if (value.concealed !== undefined) return value.concealed;
  if (value.totp !== undefined) return value.totp;
  if (value.url !== undefined) return value.url;
  if (value.email !== undefined)
    return typeof value.email === "string" ? value.email : value.email.email_address;
  if (value.phone !== undefined) return value.phone;
  if (value.creditCardNumber !== undefined) return value.creditCardNumber;
  if (value.creditCardType !== undefined) return value.creditCardType;
  if (value.menu !== undefined) return value.menu;
  if (value.gender !== undefined) return value.gender;
  if (value.date !== undefined) return seconds(value.date)?.slice(0, 10);
  if (value.monthYear !== undefined) {
    const text = String(value.monthYear);
    return `${text.slice(4, 6)}/${text.slice(2, 4)}`;
  }
  if (value.address !== undefined) {
    const a = value.address;
    return [a.street, [a.zip, a.city].filter(Boolean).join(" "), a.state, a.country]
      .filter(Boolean)
      .join("\n");
  }
  if (value.sshKey !== undefined)
    return typeof value.sshKey === "string" ? value.sshKey : value.sshKey.privateKey;
  return undefined;
}

function sectionFields(item: OnePasswordItem): { fields: Field[]; files: number } {
  const fields: Field[] = [];
  let files = 0;
  for (const section of item.details?.sections ?? []) {
    for (const field of section.fields ?? []) {
      const raw = field.value ?? {};
      if (raw.file !== undefined) {
        files++;
        continue;
      }
      const value = fieldText(raw);
      if (value === undefined) continue;
      fields.push({
        id: field.id ?? "",
        title: field.title || field.id || "",
        value,
        secret: raw.concealed !== undefined,
        raw,
      });
    }
  }
  return { fields, files };
}

/** Takes fields out of `fields` as they are used; what's left becomes custom fields. */
class FieldPool {
  readonly #fields: Field[];

  constructor(fields: Field[]) {
    this.#fields = [...fields];
  }

  take(match: (field: Field) => boolean): Field | undefined {
    const index = this.#fields.findIndex(match);
    if (index < 0) return undefined;
    const [field] = this.#fields.splice(index, 1);
    return field;
  }

  byId(...ids: string[]): string | undefined {
    return this.take((f) => ids.includes(f.id))?.value;
  }

  rest(): ForeignField[] {
    return this.#fields.map(({ title, value, secret }) => ({ title, value, secret }));
  }
}

function typed(
  item: OnePasswordItem,
  pool: FieldPool,
): Omit<ForeignRecord, "title" | "note" | "favorite" | "tags"> {
  const details = item.details ?? {};
  const loginField = (designation: string) =>
    details.loginFields?.find((f) => f.designation === designation)?.value;
  const totp = () => pool.take((f) => f.raw.totp !== undefined)?.value;
  const websites = [
    ...(item.overview?.urls ?? []).map((u) => u.url ?? ""),
    item.overview?.url ?? "",
  ];

  switch (item.categoryUuid) {
    case CATEGORY.login:
    case CATEGORY.password:
      return {
        type: "login",
        fields: {
          username: loginField("username"),
          password: loginField("password") ?? details.password,
          totp: totp(),
        },
        websites,
      };
    case CATEGORY.card:
      return {
        type: "card",
        fields: {
          cardholderName: pool.byId("cardholder"),
          number: pool.byId("ccnum"),
          expiry: pool.byId("expiry"),
          securityCode: pool.byId("cvv"),
          pin: pool.byId("pin"),
        },
      };
    case CATEGORY.identity: {
      const address = pool.take((f) => f.id === "address")?.raw.address;
      return {
        type: "identity",
        fields: {
          firstName: pool.byId("firstname"),
          lastName: pool.byId("lastname"),
          birthDate: pool.byId("birthdate"),
          email: pool.byId("email"),
          phone: pool.byId("defphone", "cellphone", "homephone", "busphone"),
          street: address?.street,
          postalCode: address?.zip,
          city: address?.city,
          country: address?.country,
        },
        customFields: address?.state ? [{ title: "State", value: address.state }] : [],
      };
    }
    case CATEGORY.note:
      return { type: "note" };
    case CATEGORY.wifi: {
      const security = pool.byId("wireless_security");
      const mapped = security ? WIFI_SECURITY[security] : undefined;
      return {
        type: "wifi",
        fields: {
          ssid: pool.byId("network_name"),
          password: pool.byId("wireless_password") ?? details.password,
          security: mapped,
        },
        customFields: security && !mapped ? [{ title: "Security", value: security }] : [],
      };
    }
    case CATEGORY.apiKey:
      return {
        type: "api_key",
        fields: {
          keyId: pool.byId("username"),
          secret: pool.byId("credential"),
          host: pool.byId("hostname"),
        },
      };
    case CATEGORY.sshKey: {
      const key = pool.take((f) => f.raw.sshKey !== undefined)?.raw.sshKey;
      return {
        type: "ssh_key",
        fields:
          typeof key === "object"
            ? { privateKey: key.privateKey, publicKey: key.metadata?.publicKey }
            : { privateKey: key },
      };
    }
    default:
      // A category with no type here (bank account, passport, …): a note, its fields as custom fields.
      return { type: "note" };
  }
}

/** Larger is a zip bomb, not an export: the records alone, files aside, are a few MB. */
const MAX_EXPORT_DATA_BYTES = 100 * 1024 * 1024;

export function readOnePasswordExport(zip: Uint8Array): OnePasswordExport {
  const files = unzipSync(zip, {
    filter: (file) => file.name === "export.data" && file.originalSize <= MAX_EXPORT_DATA_BYTES,
  });
  const data = files["export.data"];
  if (!data) throw new Error("No export.data in the 1PUX file");
  return JSON.parse(new TextDecoder().decode(data)) as OnePasswordExport;
}

/**
 * 1Password vaults become tags when the export holds more than one; tags stay
 * tags, archived items are tagged "Archived". Documents are skipped.
 */
export function importOnePassword(file: OnePasswordExport): ForeignImport {
  const builder = new ForeignImportBuilder("1password");
  const vaults = (file.accounts ?? []).flatMap((account) => account.vaults ?? []);

  for (const vault of vaults) {
    const vaultTag = vaults.length > 1 ? vault.attrs?.name : undefined;
    for (const item of vault.items ?? []) {
      const title = item.overview?.title ?? "";
      const { fields, files } = sectionFields(item);
      if (item.categoryUuid === CATEGORY.document || item.details?.documentAttributes) {
        builder.skip(title || "Untitled", "unsupported_type");
        continue;
      }
      const pool = new FieldPool(fields);
      const record = typed(item, pool);
      const history = item.details?.passwordHistory ?? [];
      builder.add({
        ...record,
        title,
        note: item.details?.notesPlain,
        favorite: (item.favIndex ?? 0) > 0,
        tags: [
          ...(vaultTag ? [vaultTag] : []),
          ...(item.overview?.tags ?? []),
          ...(item.state === "archived" ? ["Archived"] : []),
        ],
        customFields: [...(record.customFields ?? []), ...pool.rest()],
        createdAt: seconds(item.createdAt),
        passwordChangedAt: latestDate(history.map((h) => seconds(h.time))),
        leftBehind: {
          previousPasswords: history.length,
          attachments: files,
          passkeys: item.details?.passkey ? 1 : 0,
        },
      });
    }
  }
  return builder.build();
}
