ALTER TABLE "users" DROP CONSTRAINT "users_encryptedEmail_key";--> statement-breakpoint
DROP INDEX "records_vault_record_version_idx";--> statement-breakpoint
CREATE INDEX "account_events_created_at_index" ON "account_events" ("created_at");--> statement-breakpoint
CREATE INDEX "vault_members_sealed_by_idx" ON "vault_members" ("sealedByUserId");