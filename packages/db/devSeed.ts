import { config } from "dotenv";

// Load DB env (DATABASE_URL) and server env (OPAQUE_* vars).
config();
config({ path: "../../apps/server/.env" });

import {
  OpaqueClient,
  OpaqueID,
  OpaqueServer,
  getOpaqueConfig,
  type AKEExportKeyPair,
} from "@cloudflare/opaque-ts";
import { reset } from "drizzle-seed";
import { db, schema, usersTable, keysTable, recordsTable } from ".";
import {
  encryptEmail,
  encryptXChaCha,
  genKey,
  genPasswordKek,
  genSalt,
  hashEmail,
  hkdf,
} from "@repo/crypto";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import { exampleLoginRecords, type RecordSchema } from "@repo/schema";

const EMAIL = "passmgr@example.com";
const PASSWORD = "passmgr123";
const SERVER_IDENTITY = "passmgr";

async function seed() {
  const { OPAQUE_OPRF_SEED, OPAQUE_AKE_PRIVATE_KEY, OPAQUE_SERVER_SETUP } = process.env;
  if (!OPAQUE_OPRF_SEED || !OPAQUE_AKE_PRIVATE_KEY || !OPAQUE_SERVER_SETUP) {
    console.error(
      "OPAQUE_OPRF_SEED, OPAQUE_AKE_PRIVATE_KEY and OPAQUE_SERVER_SETUP env vars are required. Copy them from apps/server/.env (generate via bun apps/server/scripts/opaque-cf-bootstrap.ts).",
    );
    process.exit(1);
  }

  const serverKey = fromString(OPAQUE_SERVER_SETUP);

  // 1. Reset database
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

  // 3. Generate key hierarchy
  const { passwordKek, passwordKekParams, passwordKekSaltData } = await genPasswordKek(PASSWORD);
  const recoveryKey = genKey();
  const recoveryKekSaltData = genSalt();
  const recoveryKek = await hkdf(recoveryKey, "recoveryRootKey", recoveryKekSaltData);
  const vaultKey = genKey();

  const [encryptedVaultKey, vaultKeyEncryptionNonce] = encryptXChaCha(passwordKek, vaultKey);
  const [encryptedVaultKeyRecovery, vaultKeyEncryptionNonceRecovery] = encryptXChaCha(
    recoveryKek,
    vaultKey,
  );

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

  // 6. Insert keys
  await db.insert(keysTable).values({
    userId,
    recoveryKekSalt: toBase64(recoveryKekSaltData),
    passwordKekParams,
    passwordKekSalt: toBase64(passwordKekSaltData),
    encryptedVaultKey,
    vaultKeyEncryptionNonce,
    encryptedVaultKeyRecovery,
    vaultKeyEncryptionNonceRecovery,
  });

  // 7. Encrypt and insert seed records
  console.log(`Inserting ${exampleLoginRecords.length} seed records...`);

  const now = new Date();
  const recordRows = exampleLoginRecords.map((loginRecord, i) => {
    const payload: RecordSchema = { schemaVersion: 1, ...loginRecord };
    const [encryptedData, encryptionNonce] = encryptXChaCha(vaultKey, JSON.stringify(payload));

    return {
      recordId: crypto.randomUUID(),
      userId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: 1,
      version: 1,
      clientUpdatedAt: new Date(now.getTime() + i),
    };
  });

  await db.insert(recordsTable).values(recordRows);

  console.log(`Done! Seeded user ${EMAIL} with ${recordRows.length} records.`);
  process.exit(0);
}

await seed();
