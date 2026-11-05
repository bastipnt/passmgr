ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" timestamp;--> statement-breakpoint
UPDATE "users" SET "emailVerifiedAt" = "created_at";