ALTER TABLE "users" ADD COLUMN "emailEncryptionKeySalt" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emailHashKeySalt" varchar NOT NULL;