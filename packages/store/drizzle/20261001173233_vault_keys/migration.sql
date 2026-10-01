CREATE TABLE `vaults` (
	`vaultId` text PRIMARY KEY,
	`kind` text NOT NULL,
	`keyVersion` integer NOT NULL,
	`encryptedVaultKey` text NOT NULL,
	`vaultKeyEncryptionNonce` text NOT NULL
);
