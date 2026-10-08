CREATE TABLE `profiles` (
	`profileId` text PRIMARY KEY,
	`mode` text NOT NULL,
	`email` text,
	`userId` text UNIQUE,
	`name` text,
	`databaseName` text NOT NULL UNIQUE,
	`createdAt` text NOT NULL,
	`lastUsedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `registry_meta` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `profiles_email_idx` ON `profiles` (`email`);