ALTER TABLE "keys" DROP CONSTRAINT "keys_recoveryKekSalt_key";--> statement-breakpoint
ALTER TABLE "keys" DROP CONSTRAINT "keys_encryptedVaultKeyRecovery_key";--> statement-breakpoint
ALTER TABLE "keys" DROP CONSTRAINT "keys_vaultKeyEncryptionNonceRecovery_key";--> statement-breakpoint
CREATE UNIQUE INDEX "key_active_user_idx" ON "keys" ("userId") WHERE "valid_to" IS NULL AND "deleted_at" IS NULL;