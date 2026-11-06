import type { RecordData } from "../record-types";
import type { VaultMeta } from "../vault-schema";
import { exampleLoginRecords } from "./login-record-seed";
import { exampleTypedRecords } from "./typed-record-seed";

export type SeedVault = {
  meta: VaultMeta;
  kind: "personal" | "shared";
  holds: (record: RecordData) => boolean;
};

/** The first vault whose `holds` matches gets a record; the personal vault takes the rest. */
export const SEED_VAULTS: readonly SeedVault[] = [
  {
    meta: { name: "Acme Work", icon: "briefcase", color: "blue" },
    kind: "shared",
    holds: (record) => hasAnyTag(record, ["work", "client-acme"]),
  },
  {
    meta: { name: "Family", icon: "home", color: "green" },
    kind: "shared",
    holds: (record) => hasAnyTag(record, ["family", "home"]),
  },
  { meta: { name: "Personal" }, kind: "personal", holds: () => true },
];

export function seedVaultIndex(record: RecordData): number {
  return SEED_VAULTS.findIndex(({ holds }) => holds(record));
}

function hasAnyTag(record: RecordData, tags: string[]): boolean {
  return (record.tags ?? []).some((tag) => tags.includes(tag));
}

/** One version of a demo record, `daysAgo` before the demo starts. */
export type DemoSeedVersion = { data: RecordData; daysAgo: number };

export type DemoSeedRecord = {
  /** Index into `SEED_VAULTS`. */
  vault: number;
  /** Oldest first; the last one is the record as it is now. */
  versions: [DemoSeedVersion, ...DemoSeedVersion[]];
  /** Set: the record sits in the trash, deleted that many days ago. */
  deletedDaysAgo?: number;
};

const FAVORITES = new Set(["GitHub", "Google", "Home Wi-Fi", "Visa (personal)"]);

/** Earlier passwords, oldest first: "previous passwords" and version history have something to show. */
const PREVIOUS_PASSWORDS: Record<string, { password: string; daysAgo: number }[]> = {
  GitHub: [
    { password: "github2019", daysAgo: 700 },
    { password: "Gh!tHub-2022", daysAgo: 420 },
  ],
  PayPal: [{ password: "Paypal123", daysAgo: 600 }],
  "Microsoft (Work)": [{ password: "Acme#Spring24", daysAgo: 200 }],
};

const TRASHED: DemoSeedRecord[] = [
  {
    vault: SEED_VAULTS.length - 1,
    versions: [
      {
        daysAgo: 900,
        data: {
          type: "login",
          title: "MySpace",
          tags: ["social", "legacy"],
          username: "linpark88",
          password: "myspace88",
          websites: [{ value: "https://myspace.com" }],
          customFields: [],
          note: "Account closed.",
        },
      },
    ],
    deletedDaysAgo: 30,
  },
  {
    vault: SEED_VAULTS.length - 1,
    versions: [
      {
        daysAgo: 320,
        data: {
          type: "note",
          title: "Old gym locker code",
          tags: ["personal"],
          note: "Locker 42: 1739",
        },
      },
    ],
    deletedDaysAgo: 5,
  },
];

/**
 * The demo vault's content: the dev seed's example records (no QA edge cases),
 * spread over the seed vaults and the past two years, with favorites, password
 * history and a few records in the trash. Its weak, reused, old and `http://`
 * logins give Pass Monitor something to find.
 */
export function demoSeed(): DemoSeedRecord[] {
  const live = [...exampleLoginRecords, ...exampleTypedRecords].map((record, i): DemoSeedRecord => {
    const createdDaysAgo = 20 + ((i * 37) % 710);
    const data: RecordData = FAVORITES.has(record.title) ? { ...record, favorite: true } : record;
    const previous = PREVIOUS_PASSWORDS[record.title] ?? [];
    const first = previous[0];
    const versions: DemoSeedRecord["versions"] = first
      ? [
          { data: { ...data, password: first.password } as RecordData, daysAgo: first.daysAgo },
          ...previous.slice(1).map(({ password, daysAgo }) => ({
            data: { ...data, password } as RecordData,
            daysAgo,
          })),
          { data, daysAgo: Math.min(createdDaysAgo, 60) },
        ]
      : [{ data, daysAgo: createdDaysAgo }];
    return { vault: seedVaultIndex(record), versions };
  });
  return [...live, ...TRASHED];
}
