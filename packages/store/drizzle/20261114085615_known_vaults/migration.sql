CREATE TABLE `known_vaults` (
	`vaultId` text PRIMARY KEY,
	`kind` text NOT NULL,
	`keyVersion` integer NOT NULL
);
