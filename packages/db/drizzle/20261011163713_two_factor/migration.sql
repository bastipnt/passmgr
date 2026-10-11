CREATE TABLE "user_backup_codes" (
	"id" varchar PRIMARY KEY,
	"userId" varchar NOT NULL,
	"codeHash" varchar NOT NULL,
	"usedAt" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_totp" (
	"userId" varchar PRIMARY KEY,
	"encryptedSecret" varchar NOT NULL,
	"secretNonce" varchar NOT NULL,
	"lastUsedStep" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "hasTwoFactorEnabled";--> statement-breakpoint
CREATE INDEX "user_backup_codes_userId_index" ON "user_backup_codes" ("userId");--> statement-breakpoint
ALTER TABLE "user_backup_codes" ADD CONSTRAINT "user_backup_codes_userId_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_totp" ADD CONSTRAINT "user_totp_userId_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE;