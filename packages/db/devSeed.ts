import { config } from "dotenv";

// Load DB env (DATABASE_URL) and server env (OPAQUE_SERVER_SETUP)
config();
config({ path: "../../apps/server/.env" });
import * as opaque from "@serenity-kit/opaque";
import { reset } from "drizzle-seed";
import { db, schema, usersTable, keysTable, itemsTable } from ".";
import {
  encryptEmail,
  encryptXChaCha,
  genKey,
  genPasswordKek,
  genSalt,
  hashEmail,
  hkdf,
  fromString,
} from "@repo/crypto";
import { toBase64 } from "@repo/util";
import { exampleLoginItems, type ItemSchema } from "@repo/schema";

const EMAIL = "passmgr@example.com";
const PASSWORD = "passmgr123";

async function seed() {
  await opaque.ready;

  const serverSetup = process.env.OPAQUE_SERVER_SETUP;
  if (!serverSetup) {
    console.error("OPAQUE_SERVER_SETUP env var is required. Copy it from apps/server/.env");
    process.exit(1);
  }
  const serverKey = fromString(serverSetup);

  // 1. Reset database
  console.log("Resetting database...");
  await reset(db, schema);

  // 2. OPAQUE registration (client + server in one process)
  console.log("Registering user...");
  const { clientRegistrationState, registrationRequest } = opaque.client.startRegistration({
    password: PASSWORD,
  });

  const { registrationResponse } = opaque.server.createRegistrationResponse({
    serverSetup,
    userIdentifier: EMAIL,
    registrationRequest,
  });

  const { registrationRecord } = opaque.client.finishRegistration({
    clientRegistrationState,
    registrationResponse,
    password: PASSWORD,
  });

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

  // 7. Encrypt and insert seed items
  console.log(`Inserting ${exampleLoginItems.length} seed items...`);

  const now = new Date();
  const itemRows = exampleLoginItems.map((loginItem, i) => {
    const payload: ItemSchema = { schemaVersion: 1, ...loginItem };
    const [encryptedData, encryptionNonce] = encryptXChaCha(vaultKey, JSON.stringify(payload));

    return {
      itemId: crypto.randomUUID(),
      userId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: 1,
      version: 1,
      clientUpdatedAt: new Date(now.getTime() + i),
    };
  });

  await db.insert(itemsTable).values(itemRows);

  console.log(`Done! Seeded user ${EMAIL} with ${itemRows.length} items.`);
  process.exit(0);
}

await seed();
