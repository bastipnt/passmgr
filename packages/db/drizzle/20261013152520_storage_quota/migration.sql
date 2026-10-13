ALTER TABLE "vaults" ADD COLUMN "usedBytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "vaults" SET "usedBytes" = "used"."bytes" FROM (SELECT "vaultId", sum(length("encryptedData") + 256) AS "bytes" FROM "records" GROUP BY "vaultId") AS "used" WHERE "vaults"."vaultId" = "used"."vaultId";
