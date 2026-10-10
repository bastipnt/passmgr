ALTER TABLE `records` ADD `keyVersion` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `vaults` ADD `previousKeys` text DEFAULT '[]' NOT NULL;