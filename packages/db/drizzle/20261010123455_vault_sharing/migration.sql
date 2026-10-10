ALTER TABLE "vault_members" ADD COLUMN "sealedVaultKey" varchar;--> statement-breakpoint
ALTER TABLE "vault_members" ADD COLUMN "sealedKeyVersion" integer;--> statement-breakpoint
ALTER TABLE "vault_members" ADD COLUMN "sealedToKeyVersion" integer;--> statement-breakpoint
ALTER TABLE "vault_members" ADD COLUMN "sealedByUserId" varchar;--> statement-breakpoint
ALTER TABLE "vault_members" ADD COLUMN "sealedByKeyVersion" integer;--> statement-breakpoint
ALTER TABLE "vaults" ADD COLUMN "keyRotationNeeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_members" ALTER COLUMN "encryptedVaultKey" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_members" ALTER COLUMN "vaultKeyEncryptionNonce" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_sealedVaultKey_key" UNIQUE("sealedVaultKey");--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_sealedByUserId_users_userId_fkey" FOREIGN KEY ("sealedByUserId") REFERENCES "users"("userId") ON DELETE SET NULL;