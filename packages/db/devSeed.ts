import { config } from "dotenv";

// Load DB env (DATABASE_URL) and server env (OPAQUE_* vars).
config();
config({ path: "../../apps/server/.env" });

import {
  type AKEExportKeyPair,
  getOpaqueConfig,
  OpaqueClient,
  OpaqueID,
  OpaqueServer,
} from "@cloudflare/opaque-ts";
import {
  createUserKeyPair,
  createVault,
  deriveOpaquePassword,
  encryptEmail,
  encryptRecordData,
  generateUserKeys,
  genKey,
  hashEmail,
  OPAQUE_SERVER_IDENTITY,
  unwrapVaultKey,
  wipe,
} from "@repo/crypto";
import {
  edgeCaseLoginRecords,
  exampleLoginRecords,
  exampleTypedRecords,
  pushChangeBytes,
  type RecordData,
  type RecordPayload,
  type VaultMeta,
} from "@repo/schema";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { reset } from "drizzle-seed";
import {
  db,
  keysTable,
  recordsTable,
  schema,
  userKeyPairsTable,
  usersTable,
  vaultMembersTable,
  vaultsTable,
} from ".";

const EMAIL = "passmgr@example.com";
const PASSWORD = "passmgr123";
// `bun devSeed.ts --edge-cases` also seeds the QA edge-case records.
const WITH_EDGE_CASES = process.argv.includes("--edge-cases");
const DAY_MS = 24 * 60 * 60 * 1000;

type SeedVault = {
  meta: VaultMeta;
  kind: "personal" | "shared";
  holds: (record: RecordData) => boolean;
};

// The first vault whose `holds` matches gets the record; the personal vault takes the rest.
const SEED_VAULTS: SeedVault[] = [
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

function hasAnyTag(record: RecordData, tags: string[]): boolean {
  return (record.tags ?? []).some((tag) => tags.includes(tag));
}

async function seed() {
  const { OPAQUE_OPRF_SEED, OPAQUE_AKE_PRIVATE_KEY, OPAQUE_SERVER_SETUP } = process.env;
  if (!OPAQUE_OPRF_SEED || !OPAQUE_AKE_PRIVATE_KEY || !OPAQUE_SERVER_SETUP) {
    console.error(
      "OPAQUE_OPRF_SEED, OPAQUE_AKE_PRIVATE_KEY and OPAQUE_SERVER_SETUP env vars are required. Copy them from apps/server/.env (generate via bun apps/server/scripts/opaque-cf-bootstrap.ts).",
    );
    process.exit(1);
  }

  const serverKey = fromString(OPAQUE_SERVER_SETUP);

  // 1. Bring the schema up to date (reset only truncates), then reset data
  console.log("Applying migrations...");
  await migrate(db, { migrationsFolder: `${import.meta.dirname}/drizzle` });
  console.log("Resetting database...");
  await reset(db, schema);

  // 2. OPAQUE registration (client + server in one process)
  console.log("Registering user...");
  const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
  const akePrivBytes = fromBase64(OPAQUE_AKE_PRIVATE_KEY);
  const akePublic = cfg.ake.recoverPublicKey(akePrivBytes);
  const akeKeypair: AKEExportKeyPair = {
    private_key: Array.from(akePrivBytes),
    public_key: Array.from(akePublic.public_key),
  };
  const oprfSeed = Array.from(fromBase64(OPAQUE_OPRF_SEED));
  const opaqueServer = new OpaqueServer(cfg, oprfSeed, akeKeypair, OPAQUE_SERVER_IDENTITY);

  const client = new OpaqueClient(cfg);
  const opaquePassword = await deriveOpaquePassword(PASSWORD, EMAIL);
  const req = await client.registerInit(toBase64(opaquePassword));
  wipe(opaquePassword);
  if (req instanceof Error) throw req;
  const resp = await opaqueServer.registerInit(req, EMAIL);
  if (resp instanceof Error) throw resp;
  const finished = await client.registerFinish(resp, OPAQUE_SERVER_IDENTITY, EMAIL);
  if (finished instanceof Error) throw finished;
  const registrationRecord = toBase64(Uint8Array.from(finished.record.serialize()));

  // 3. Generate key hierarchy (same code path as client registration)
  const accountKey = genKey();
  const { recoveryKey, ...userKeys } = await generateUserKeys(PASSWORD, accountKey);
  const vaults = SEED_VAULTS.map((seedVault) => {
    const vault = createVault(accountKey, seedVault.meta);
    return { ...seedVault, vault, vaultKey: unwrapVaultKey(accountKey, vault) };
  });
  const userKeyPair = createUserKeyPair(accountKey);

  // 4. Encrypt email
  const [encryptedEmail, emailNonce, emailEncryptionKeySalt] = await encryptEmail(serverKey, EMAIL);
  const emailHash = toBase64(await hashEmail(serverKey, EMAIL));

  // 5. Insert user
  const [user] = await db
    .insert(usersTable)
    .values({
      encryptedEmail,
      emailNonce,
      emailEncryptionKeySalt,
      emailHash,
      registrationRecord,
    })
    .returning({ userId: usersTable.userId });

  if (!user) {
    console.error("Failed to insert user");
    process.exit(1);
  }

  const { userId } = user;
  console.log(`User created: ${userId}`);

  // 6. Insert keys, the keypair + the vaults
  await db.insert(keysTable).values({ userId, ...userKeys });
  await db.insert(userKeyPairsTable).values({ userId, ...userKeyPair });
  for (const { vault, kind } of vaults) {
    const { vaultId, encryptedMeta, metaEncryptionNonce, ...vaultKeyWrap } = vault;
    await db
      .insert(vaultsTable)
      .values({ vaultId, ownerId: userId, kind, encryptedMeta, metaEncryptionNonce });
    await db.insert(vaultMembersTable).values({ vaultId, userId, role: "owner", ...vaultKeyWrap });
  }

  // 7. Encrypt and insert seed records
  const seedRecords: RecordData[] = [
    ...exampleLoginRecords,
    ...exampleTypedRecords,
    ...(WITH_EDGE_CASES ? edgeCaseLoginRecords : []),
  ];
  console.log(`Inserting ${seedRecords.length} seed records...`);

  // Spread creation over the past ~2 years so sorting and "old password"
  // views have something to show.
  const now = Date.now();
  const seqs = new Map<string, number>();
  const recordRows = seedRecords.map((seedRecord, i) => {
    const { vault, vaultKey } = vaults.find(({ holds }) => holds(seedRecord))!;
    const { vaultId } = vault;
    const seq = (seqs.get(vaultId) ?? 0) + 1;
    seqs.set(vaultId, seq);
    const payload: RecordPayload = { schemaVersion: 1, ...seedRecord };
    const recordId = crypto.randomUUID();
    const [encryptedData, encryptionNonce] = encryptRecordData(
      vaultKey,
      { recordId, vaultId, cryptoVersion: 1 },
      JSON.stringify(payload),
    );
    const createdAt = new Date(now - ((i * 37) % 730) * DAY_MS - i * 60_000);

    return {
      recordId,
      vaultId,
      userId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: 1,
      version: 1,
      seq,
      clientChangeId: crypto.randomUUID(),
      clientUpdatedAt: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    };
  });

  await db.insert(recordsTable).values(recordRows);
  for (const { vault, meta } of vaults) {
    const rows = recordRows.filter((row) => row.vaultId === vault.vaultId);
    await db
      .update(vaultsTable)
      .set({
        lastSeq: rows.length,
        usedBytes: rows.reduce((sum, row) => sum + pushChangeBytes(row), 0),
      })
      .where(eq(vaultsTable.vaultId, vault.vaultId));
    console.log(`  ${meta.name}: ${rows.length} records`);
  }

  console.log(
    `Done! Seeded user ${EMAIL} / ${PASSWORD} with ${recordRows.length} records in ${vaults.length} vaults.`,
  );
  console.log(`Recovery key (dev only): ${toBase64(recoveryKey)}`);
  process.exit(0);
}

await seed();
