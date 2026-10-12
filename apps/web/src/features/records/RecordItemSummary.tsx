import { useVaults } from "@repo/client";
import type { DecryptedRecord } from "@repo/schema";
import { ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@repo/ui/components/Item";
import type { ReactNode } from "react";
import { VaultBadge } from "@/features/vaults";
import { RecordAvatar } from "./RecordAvatar";

/** Avatar, title and one detail line (with the vault once there are several), inside an `Item`. */
export function RecordItemSummary({
  record,
  detail,
}: {
  record: DecryptedRecord;
  detail: ReactNode;
}) {
  const { getVault, hasSeveralVaults } = useVaults();
  const vault = hasSeveralVaults ? getVault(record.vaultId) : undefined;

  return (
    <>
      <ItemMedia>
        <RecordAvatar record={record} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle className="truncate">{record.title}</ItemTitle>
        <ItemDescription className="line-clamp-1">
          {vault && (
            <>
              <VaultBadge vault={vault} className="max-w-[45%] align-bottom" />
              {" · "}
            </>
          )}
          {detail}
        </ItemDescription>
      </ItemContent>
    </>
  );
}
