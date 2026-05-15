CREATE TABLE "keys" (
	"keySetId" varchar PRIMARY KEY,
	"userId" varchar NOT NULL,
	"recoveryKekSalt" varchar NOT NULL UNIQUE,
	"passwordKekParams" json NOT NULL,
	"passwordKekSalt" varchar NOT NULL UNIQUE,
	"encryptedVaultKey" varchar NOT NULL UNIQUE,
	"vaultKeyEncryptionNonce" varchar NOT NULL UNIQUE,
	"encryptedVaultKeyRecovery" varchar NOT NULL UNIQUE,
	"vaultKeyEncryptionNonceRecovery" varchar NOT NULL UNIQUE,
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
CREATE INDEX "key_user_id_idx" ON "keys" ("userId");--> statement-breakpoint
CREATE INDEX "records_user_id_idx" ON "records" ("userId");--> statement-breakpoint
CREATE INDEX "records_record_id_idx" ON "records" ("recordId");--> statement-breakpoint
CREATE UNIQUE INDEX "records_record_id_version_idx" ON "records" ("recordId","version");--> statement-breakpoint
CREATE INDEX "records_user_record_version_idx" ON "records" ("userId","recordId","version");--> statement-breakpoint
CREATE INDEX "records_user_updated_at_idx" ON "records" ("userId","updated_at");