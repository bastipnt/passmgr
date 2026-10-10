CREATE TABLE `revoked_records` (
	`recordId` text PRIMARY KEY,
	`vaultId` text NOT NULL,
	`encryptedData` text NOT NULL,
	`encryptionNonce` text NOT NULL,
	`cryptoVersion` integer NOT NULL,
	`keyVersion` integer NOT NULL,
	`version` integer NOT NULL,
	`clientUpdatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `revoked_vaults` (
	`vaultId` text PRIMARY KEY,
	`kind` text NOT NULL,
	`role` text NOT NULL,
	`keyVersion` integer NOT NULL,
	`encryptedVaultKey` text NOT NULL,
	`vaultKeyEncryptionNonce` text NOT NULL,
	`previousKeys` text DEFAULT '[]' NOT NULL,
	`encryptedMeta` text NOT NULL,
	`metaEncryptionNonce` text NOT NULL,
	`revokedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `revoked_records_vault_idx` ON `revoked_records` (`vaultId`);