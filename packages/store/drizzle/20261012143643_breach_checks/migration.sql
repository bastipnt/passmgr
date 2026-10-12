CREATE TABLE `breach_checks` (
	`recordId` text NOT NULL,
	`version` integer NOT NULL,
	`clientUpdatedAt` text NOT NULL,
	`vaultId` text NOT NULL,
	`count` integer NOT NULL,
	`checkedAt` text NOT NULL,
	CONSTRAINT `breach_checks_pk` PRIMARY KEY(`recordId`, `version`, `clientUpdatedAt`)
);
--> statement-breakpoint
CREATE TABLE `profile_settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `breach_checks_vault_idx` ON `breach_checks` (`vaultId`);