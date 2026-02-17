CREATE TABLE "sessions" (
	"sessionId" varchar PRIMARY KEY,
	"userId" varchar NOT NULL,
	"sessionKey" varchar NOT NULL,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "sessions" ("userId");