CREATE TABLE `outbox` (
	`seq` integer PRIMARY KEY,
	`changeId` text NOT NULL UNIQUE,
	`recordId` text NOT NULL,
	`version` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `records` ADD `syncState` text DEFAULT 'synced' NOT NULL;--> statement-breakpoint
CREATE INDEX `outbox_record_idx` ON `outbox` (`recordId`,`version`);