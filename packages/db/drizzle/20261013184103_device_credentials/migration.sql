CREATE TABLE "device_credentials" (
	"credentialId" varchar PRIMARY KEY,
	"userId" varchar NOT NULL,
	"publicKey" varchar NOT NULL,
	"algorithm" integer NOT NULL,
	"signCount" bigint DEFAULT 0 NOT NULL,
	"passwordVerifiedAt" timestamp DEFAULT now() NOT NULL,
	"deviceName" varchar,
	"lastUsedAt" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "device_credentials_userId_index" ON "device_credentials" ("userId");--> statement-breakpoint
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_userId_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE;