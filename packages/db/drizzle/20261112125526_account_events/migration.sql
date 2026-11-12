CREATE TABLE "account_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "account_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"userId" varchar NOT NULL,
	"type" varchar NOT NULL,
	"sealedDeviceName" varchar,
	"deviceKeyVersion" integer,
	"deviceNameHash" varchar,
	"newDevice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_events_userId_id_index" ON "account_events" ("userId","id");--> statement-breakpoint
CREATE INDEX "account_events_userId_deviceNameHash_index" ON "account_events" ("userId","deviceNameHash");--> statement-breakpoint
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_userId_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("userId") ON DELETE CASCADE;