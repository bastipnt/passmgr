-- A shared vault's "ownerId" (whose quota it counts against) names an active owner: the longest-standing one.
UPDATE "vaults" AS v SET "ownerId" = (
  SELECT m."userId" FROM "vault_members" AS m
  WHERE m."vaultId" = v."vaultId" AND m."role" = 'owner' AND m."status" = 'active'
  ORDER BY m."created_at", m."userId" LIMIT 1
), "updated_at" = now()
WHERE v."kind" = 'shared'
  AND EXISTS (
    SELECT 1 FROM "vault_members" AS m
    WHERE m."vaultId" = v."vaultId" AND m."role" = 'owner' AND m."status" = 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "vault_members" AS m
    WHERE m."vaultId" = v."vaultId" AND m."userId" = v."ownerId" AND m."role" = 'owner' AND m."status" = 'active'
  );
