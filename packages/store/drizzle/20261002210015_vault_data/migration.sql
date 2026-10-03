-- Hand-edited: SQLite can't ADD a NOT NULL column without a default. Everything
-- here is a cache of the server (no local-only vaults exist yet, ADR 0001), so
-- the tables are rebuilt empty and the next online login refills them.
DROP TABLE `records`;--> statement-breakpoint
CREATE TABLE `records` (
	`recordId` text NOT NULL,
	`vaultId` text NOT NULL,
	`encryptedData` text NOT NULL,
	`encryptionNonce` text NOT NULL,
	`cryptoVersion` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`clientUpdatedAt` text NOT NULL,
	`created_at` text,
	`updated_at` text,
	`deleted_at` text,
	CONSTRAINT `records_pk` PRIMARY KEY(`recordId`, `version`)
);--> statement-breakpoint
CREATE INDEX `records_vault_idx` ON `records` (`vaultId`);--> statement-breakpoint
DROP TABLE `vaults`;--> statement-breakpoint
CREATE TABLE `vaults` (
	`vaultId` text PRIMARY KEY,
	`kind` text NOT NULL,
	`role` text NOT NULL,
	`keyVersion` integer NOT NULL,
	`encryptedVaultKey` text NOT NULL,
	`vaultKeyEncryptionNonce` text NOT NULL,
	`encryptedMeta` text NOT NULL,
	`metaEncryptionNonce` text NOT NULL
);--> statement-breakpoint
DELETE FROM `sync_meta`;--> statement-breakpoint
DELETE FROM `key_material`;
