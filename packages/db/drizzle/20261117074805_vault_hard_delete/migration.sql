DELETE FROM "vaults" WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint
DROP INDEX "vaults_one_personal_per_owner_idx";--> statement-breakpoint
ALTER TABLE "vaults" DROP COLUMN "deleted_at";--> statement-breakpoint
CREATE UNIQUE INDEX "vaults_one_personal_per_owner_idx" ON "vaults" ("ownerId") WHERE "kind" = 'personal';--> statement-breakpoint
ALTER TABLE "vault_members" ADD COLUMN "invitedByUserId" varchar;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_invitedByUserId_users_userId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("userId") ON DELETE SET NULL;--> statement-breakpoint
UPDATE "vault_members" SET "invitedByUserId" = "sealedByUserId" WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "vault_members_pending_inviter_idx" ON "vault_members" ("invitedByUserId") WHERE "status" = 'pending';
