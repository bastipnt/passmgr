CREATE TABLE "vault_key_links" (
	"vaultId" varchar,
	"keyVersion" integer,
	"encryptedVaultKey" varchar NOT NULL UNIQUE,
	"vaultKeyEncryptionNonce" varchar NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vault_key_links_pkey" PRIMARY KEY("vaultId","keyVersion")
);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "keyVersion" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_key_links" ADD CONSTRAINT "vault_key_links_vaultId_vaults_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "vaults"("vaultId") ON DELETE CASCADE;