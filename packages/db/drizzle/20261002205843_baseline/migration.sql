CREATE TABLE "keys" (
	"keySetId" varchar PRIMARY KEY,
	"userId" varchar NOT NULL,
	"recoveryKekSalt" varchar NOT NULL,
	"passwordKekParams" json NOT NULL,
	"passwordKekSalt" varchar NOT NULL UNIQUE,
	"encryptedAccountKey" varchar NOT NULL UNIQUE,
	"accountKeyEncryptionNonce" varchar NOT NULL UNIQUE,
	"encryptedAccountKeyRecovery" varchar NOT NULL,
	"accountKeyEncryptionNonceRecovery" varchar NOT NULL,
	"recoveryVerifier" varchar,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_to" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "records" (
	"rowId" varchar PRIMARY KEY,
	"recordId" varchar NOT NULL,
	"vaultId" varchar NOT NULL,
	"userId" varchar NOT NULL,
	"encryptedData" varchar NOT NULL,
	"encryptionNonce" varchar NOT NULL,
	"cryptoVersion" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"clientUpdatedAt" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_key_pairs" (
	"userId" varchar,
	"keyVersion" integer,
	"publicKey" varchar NOT NULL UNIQUE,
	"encryptedPrivateKey" varchar NOT NULL UNIQUE,
	"privateKeyEncryptionNonce" varchar NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_key_pairs_pkey" PRIMARY KEY("userId","keyVersion")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"userId" varchar PRIMARY KEY,
	"encryptedEmail" varchar NOT NULL UNIQUE,
	"emailNonce" varchar NOT NULL,
	"emailEncryptionKeySalt" varchar NOT NULL,
	"emailHash" varchar NOT NULL UNIQUE,
	"registrationRecord" varchar NOT NULL UNIQUE,
	"hasTwoFactorEnabled" boolean NOT NULL,
	"hasEmailVerified" boolean NOT NULL,
	"lastLoginAt" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "vault_members" (
	"vaultId" varchar,
	"userId" varchar,
	"role" varchar NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"keyVersion" integer NOT NULL,
	"encryptedVaultKey" varchar NOT NULL UNIQUE,
	"vaultKeyEncryptionNonce" varchar NOT NULL UNIQUE,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vault_members_pkey" PRIMARY KEY("vaultId","userId")
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"vaultId" varchar PRIMARY KEY,
	"ownerId" varchar NOT NULL,
	"kind" varchar NOT NULL,
	"keyVersion" integer DEFAULT 1 NOT NULL,
	"encryptedMeta" varchar NOT NULL,
	"metaEncryptionNonce" varchar NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "key_user_id_idx" ON "keys" ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "key_active_user_idx" ON "keys" ("userId") WHERE "valid_to" IS NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "records_user_id_idx" ON "records" ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "records_record_id_version_idx" ON "records" ("recordId","version");--> statement-breakpoint
CREATE INDEX "records_vault_record_version_idx" ON "records" ("vaultId","recordId","version");--> statement-breakpoint
CREATE INDEX "records_vault_updated_at_idx" ON "records" ("vaultId","updated_at");--> statement-breakpoint
CREATE INDEX "vault_members_user_idx" ON "vault_members" ("userId");--> statement-breakpoint
CREATE INDEX "vaults_owner_idx" ON "vaults" ("ownerId");--> statement-breakpoint
CREATE UNIQUE INDEX "vaults_one_personal_per_owner_idx" ON "vaults" ("ownerId") WHERE "kind" = 'personal' AND "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "keys" ADD CONSTRAINT "keys_userId_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_vaultId_vaults_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "vaults"("vaultId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_userId_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_key_pairs" ADD CONSTRAINT "user_key_pairs_userId_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_vaultId_vaults_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "vaults"("vaultId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_userId_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_ownerId_users_userId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("userId") ON DELETE CASCADE;