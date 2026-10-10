import { Client } from "pg";

export async function getClient(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

export async function truncateAll(client: Client): Promise<void> {
  await client.query(
    'TRUNCATE "users", "keys", "records", "vaults", "vault_members", "vault_key_links", "user_key_pairs" RESTART IDENTITY CASCADE',
  );
}

export function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  const uniq = crypto.randomUUID();
  return {
    userId: crypto.randomUUID(),
    encryptedEmail: `enc-email-${uniq}`,
    emailNonce: `enc-email-nonce-${uniq}`,
    emailEncryptionKeySalt: `enc-email-salt-${uniq}`,
    emailHash: `email-hash-${uniq}`,
    registrationRecord: `reg-record-${uniq}`,
    hasTwoFactorEnabled: false,
    hasEmailVerified: true,
    ...overrides,
  };
}

export async function insertUser(
  client: Client,
  overrides: Partial<UserRow> = {},
): Promise<UserRow> {
  const row = makeUserRow(overrides);
  await client.query(
    `INSERT INTO "users" ("userId", "encryptedEmail", "emailNonce", "emailEncryptionKeySalt", "emailHash", "registrationRecord", "hasTwoFactorEnabled", "hasEmailVerified")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.userId,
      row.encryptedEmail,
      row.emailNonce,
      row.emailEncryptionKeySalt,
      row.emailHash,
      row.registrationRecord,
      row.hasTwoFactorEnabled,
      row.hasEmailVerified,
    ],
  );
  return row;
}

export function makeKeyRow(userId: string, overrides: Partial<KeyRow> = {}): KeyRow {
  const uniq = crypto.randomUUID();
  return {
    keySetId: crypto.randomUUID(),
    userId,
    recoveryKekSalt: `rec-kek-salt-${uniq}`,
    passwordKekParams: { t: 1, m: 8, p: 1 },
    passwordKekSalt: `pwd-kek-salt-${uniq}`,
    encryptedAccountKey: `enc-ak-${uniq}`,
    accountKeyEncryptionNonce: `ak-nonce-${uniq}`,
    encryptedAccountKeyRecovery: `enc-ak-rec-${uniq}`,
    accountKeyEncryptionNonceRecovery: `ak-rec-nonce-${uniq}`,
    ...overrides,
  };
}

export async function insertKey(
  client: Client,
  userId: string,
  overrides: Partial<KeyRow> = {},
): Promise<KeyRow> {
  const row = makeKeyRow(userId, overrides);
  await client.query(
    `INSERT INTO "keys" ("keySetId", "userId", "recoveryKekSalt", "passwordKekParams", "passwordKekSalt",
                        "encryptedAccountKey", "accountKeyEncryptionNonce",
                        "encryptedAccountKeyRecovery", "accountKeyEncryptionNonceRecovery")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.keySetId,
      row.userId,
      row.recoveryKekSalt,
      JSON.stringify(row.passwordKekParams),
      row.passwordKekSalt,
      row.encryptedAccountKey,
      row.accountKeyEncryptionNonce,
      row.encryptedAccountKeyRecovery,
      row.accountKeyEncryptionNonceRecovery,
    ],
  );
  return row;
}

export function makeRecordRow(userId: string, overrides: Partial<RecordRow> = {}): RecordRow {
  const uniq = crypto.randomUUID();
  return {
    rowId: crypto.randomUUID(),
    recordId: `record-${uniq}`,
    vaultId: crypto.randomUUID(),
    userId,
    encryptedData: `enc-data-${uniq}`,
    encryptionNonce: `enc-nonce-${uniq}`,
    cryptoVersion: 1,
    version: 1,
    seq: 1,
    clientChangeId: crypto.randomUUID(),
    clientUpdatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Insert a record; without a `vaultId` override it goes into a new vault of
 * `userId`. Without a `seq` override it takes the vault's next one, as the
 * server does (1 for a vault that doesn't exist, for FK tests).
 */
export async function insertRecord(
  client: Client,
  userId: string,
  overrides: Partial<RecordRow> = {},
): Promise<RecordRow> {
  const vaultId = overrides.vaultId ?? (await insertVault(client, userId, "shared"));
  const seq = overrides.seq ?? (await nextVaultSeq(client, vaultId));
  const row = makeRecordRow(userId, { ...overrides, vaultId, seq });
  await client.query(
    `INSERT INTO "records" ("rowId", "recordId", "vaultId", "userId", "encryptedData", "encryptionNonce",
                           "cryptoVersion", "version", "seq", "clientChangeId", "clientUpdatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      row.rowId,
      row.recordId,
      row.vaultId,
      row.userId,
      row.encryptedData,
      row.encryptionNonce,
      row.cryptoVersion,
      row.version,
      row.seq,
      row.clientChangeId,
      row.clientUpdatedAt,
    ],
  );
  return row;
}

async function nextVaultSeq(client: Client, vaultId: string): Promise<number> {
  const { rows } = await client.query<{ lastSeq: string }>(
    `UPDATE "vaults" SET "lastSeq" = "lastSeq" + 1 WHERE "vaultId" = $1 RETURNING "lastSeq"`,
    [vaultId],
  );
  return rows[0] ? Number(rows[0].lastSeq) : 1;
}

export type UserRow = {
  userId: string;
  encryptedEmail: string;
  emailNonce: string;
  emailEncryptionKeySalt: string;
  emailHash: string;
  registrationRecord: string;
  hasTwoFactorEnabled: boolean;
  hasEmailVerified: boolean;
};

export type KeyRow = {
  keySetId: string;
  userId: string;
  recoveryKekSalt: string;
  passwordKekParams: { t: number; m: number; p: number };
  passwordKekSalt: string;
  encryptedAccountKey: string;
  accountKeyEncryptionNonce: string;
  encryptedAccountKeyRecovery: string;
  accountKeyEncryptionNonceRecovery: string;
};

export type RecordRow = {
  rowId: string;
  recordId: string;
  vaultId: string;
  userId: string;
  encryptedData: string;
  encryptionNonce: string;
  cryptoVersion: number;
  version: number;
  seq: number;
  clientChangeId: string;
  clientUpdatedAt: Date;
};

export async function insertVault(
  client: Client,
  ownerId: string,
  kind: "personal" | "shared" = "personal",
): Promise<string> {
  const vaultId = crypto.randomUUID();
  await client.query(
    `INSERT INTO "vaults" ("vaultId", "ownerId", "kind", "encryptedMeta", "metaEncryptionNonce")
     VALUES ($1, $2, $3, $4, $5)`,
    [vaultId, ownerId, kind, `enc-meta-${vaultId}`, `meta-nonce-${vaultId}`],
  );
  return vaultId;
}

export async function insertVaultMember(
  client: Client,
  vaultId: string,
  userId: string,
  role = "owner",
): Promise<void> {
  const uniq = crypto.randomUUID();
  await client.query(
    `INSERT INTO "vault_members" ("vaultId", "userId", "role", "keyVersion",
                                  "encryptedVaultKey", "vaultKeyEncryptionNonce")
     VALUES ($1, $2, $3, 1, $4, $5)`,
    [vaultId, userId, role, `enc-vault-key-${uniq}`, `vault-key-nonce-${uniq}`],
  );
}
