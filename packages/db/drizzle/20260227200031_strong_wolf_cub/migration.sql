CREATE TABLE "keys" (
	"keySetId" varchar PRIMARY KEY,
	"userId" varchar NOT NULL UNIQUE,
	"recoveryKekSalt" varchar NOT NULL UNIQUE,
	"passwordKekParams" json,
	"passwordKekSalt" varchar NOT NULL UNIQUE,
	"encryptedVaultKey" varchar NOT NULL UNIQUE,
	"vaultKeyEncryptionNonce" varchar NOT NULL UNIQUE,
	"encryptedVaultKeyRecovery" varchar NOT NULL UNIQUE,
	"vaultKeyEncryptionNonceRecovery" varchar NOT NULL UNIQUE,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_to" timestamp,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
DROP TABLE "logins";--> statement-breakpoint
DROP TABLE "sessions";--> statement-breakpoint
CREATE INDEX "key_user_id_idx" ON "keys" ("userId");