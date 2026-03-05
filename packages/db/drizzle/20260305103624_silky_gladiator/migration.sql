CREATE TABLE "items" (
	"itemId" varchar PRIMARY KEY,
	"userId" varchar NOT NULL,
	"encryptedData" varchar NOT NULL,
	"encryptionNonce" varchar NOT NULL,
	"cryptoVersion" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"clientUpdatedAt" timestamp NOT NULL,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "items_user_id_idx" ON "items" ("userId");