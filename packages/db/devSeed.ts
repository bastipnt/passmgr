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
  encryptEmail,
  encryptRecordData,
  generateUserKeys,
  genKey,
  hashEmail,
  unwrapVaultKey,
} from "@repo/crypto";
import { edgeCaseLoginRecords, exampleLoginRecords, type RecordPayload } from "@repo/schema";
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
const SERVER_IDENTITY = "passmgr";
// `bun devSeed.ts --edge-cases` also seeds the QA edge-case records.
const WITH_EDGE_CASES = process.argv.includes("--edge-cases");
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const opaqueServer = new OpaqueServer(cfg, oprfSeed, akeKeypair, SERVER_IDENTITY);

  const client = new OpaqueClient(cfg);
  const req = await client.registerInit(PASSWORD);
  if (req instanceof Error) throw req;
  const resp = await opaqueServer.registerInit(req, EMAIL);
  if (resp instanceof Error) throw resp;
  const finished = await client.registerFinish(resp, SERVER_IDENTITY, EMAIL);
  if (finished instanceof Error) throw finished;
  const registrationRecord = toBase64(Uint8Array.from(finished.record.serialize()));

  // 3. Generate key hierarchy (same code path as client registration)
  const accountKey = genKey();
  const { recoveryKey, ...userKeys } = await generateUserKeys(PASSWORD, accountKey);
  const personalVault = createVault(accountKey, { name: "Personal" });
  const vaultKey = unwrapVaultKey(accountKey, personalVault);
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

  // 6. Insert keys, the keypair + the personal vault
  await db.insert(keysTable).values({ userId, ...userKeys });
  await db.insert(userKeyPairsTable).values({ userId, ...userKeyPair });
  const { vaultId, encryptedMeta, metaEncryptionNonce, ...personalVaultKey } = personalVault;
  await db
    .insert(vaultsTable)
    .values({ vaultId, ownerId: userId, kind: "personal", encryptedMeta, metaEncryptionNonce });
  await db
    .insert(vaultMembersTable)
    .values({ vaultId, userId, role: "owner", ...personalVaultKey });

  // 7. Encrypt and insert seed records
  const loginRecords = WITH_EDGE_CASES
    ? [...exampleLoginRecords, ...edgeCaseLoginRecords]
    : exampleLoginRecords;
  console.log(`Inserting ${loginRecords.length} seed records...`);

  // Spread creation over the past ~2 years so sorting and "old password"
  // views have something to show.
  const now = Date.now();
  const recordRows = loginRecords.map((loginRecord, i) => {
    const payload: RecordPayload = { schemaVersion: 1, ...loginRecord };
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
      seq: i + 1,
      clientUpdatedAt: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    };
  });

  await db.insert(recordsTable).values(recordRows);
  await db
    .update(vaultsTable)
    .set({ lastSeq: recordRows.length })
    .where(eq(vaultsTable.vaultId, vaultId));

  console.log(`Done! Seeded user ${EMAIL} / ${PASSWORD} with ${recordRows.length} records.`);
  console.log(`Recovery key (dev only): ${toBase64(recoveryKey)}`);
  process.exit(0);
}

await seed();
