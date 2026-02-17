CREATE TABLE "logins" (
	"loginId" varchar PRIMARY KEY,
	"userId" varchar NOT NULL,
	"serverLoginState" varchar NOT NULL,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"userId" varchar PRIMARY KEY,
	"encryptedEmail" varchar NOT NULL UNIQUE,
	"emailNonce" varchar NOT NULL,
	"emailHash" varchar NOT NULL UNIQUE,
	"registrationRecord" varchar NOT NULL UNIQUE,
	"hasTwoFactorEnabled" boolean NOT NULL,
	"hasEmailVerified" boolean NOT NULL,
	"lastLoginAt" timestamp,
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
