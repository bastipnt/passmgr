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
ALTER TABLE "user_key_pairs" ADD CONSTRAINT "user_key_pairs_userId_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE;