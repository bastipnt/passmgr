CREATE TABLE `key_material` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`recordId` text NOT NULL,
	`encryptedData` text NOT NULL,
	`encryptionNonce` text NOT NULL,
	`cryptoVersion` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`clientUpdatedAt` text NOT NULL,
	`created_at` text,
	`updated_at` text,
	`deleted_at` text,
	CONSTRAINT `records_pk` PRIMARY KEY(`recordId`, `version`)
);
--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
