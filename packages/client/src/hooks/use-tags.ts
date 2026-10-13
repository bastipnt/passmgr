import { canWriteVault, type RecordData, tagSchema } from "@repo/schema";
import { useMutation } from "@tanstack/react-query";
import { useMemo } from "react";
import { requireActive, useStore } from "../providers/StoreProvider";
import type { RecordRepository } from "../records/record-repository";
import { itemCount } from "../records/record-summary";
import { collectTags, hasTag, removeTagFrom, renameTagIn, type TagCount } from "../records/tags";
import { decryptRecord } from "../util/decrypt-record";
import type { VaultFilter } from "../vaults/vault-info";
import { useGetRecords, useReloadRecords } from "./use-records";
import { useVaults } from "./use-vaults";

export function useTags(vault: VaultFilter = "all"): TagCount[] {
  const { records } = useGetRecords();
  return useMemo(
    () => collectTags(vault === "all" ? records : records.filter((r) => r.vaultId === vault)),
    [records, vault],
  );
}

export class InvalidTagError extends Error {}

export type TagEditResult = {
  /** Records that got a new version. */
  changed: number;
  /** Records carrying the tag in a vault the user may only read. */
  skipped: number;
};

/**
 * Rename or delete a tag on every record that carries it. A tag lives in each
 * record's encrypted payload, so this is a new version per record (all in one
 * transaction, synced like any edit). Records in `read` vaults stay as they are.
 */
export function useTagActions() {
  const store = useStore();
  const { records } = useGetRecords();
  const { getVault } = useVaults();
  const reload = useReloadRecords();

  const mutation = useMutation({
    // Local only (ADR 0001 D1): never paused while the browser reports offline.
    networkMode: "always",
    mutationFn: async ({
      tag,
      edit,
    }: {
      tag: string;
      edit: (tags: string[]) => string[];
    }): Promise<TagEditResult> => {
      const tagged = records.filter((record) => hasTag(record, tag));
      const writable = tagged.filter((record) => {
        const vault = getVault(record.vaultId);
        // Not listed (yet): leave it to the server, which checks every change.
        return !vault || canWriteVault(vault.role);
      });
      const repository = requireActive(store).records;
      const updates: Parameters<RecordRepository["updateMany"]>[0][number][] = [];
      for (const { recordId } of writable) {
        const current = await storedRecord(repository, recordId);
        if (!current || !hasTag(current.data, tag)) continue;
        updates.push({
          record: { recordId, vaultId: current.vaultId },
          data: withTags(current.data, edit(current.data.tags ?? [])),
        });
      }
      await repository.updateMany(updates);
      if (updates.length > 0) await reload();
      return { changed: updates.length, skipped: tagged.length - writable.length };
    },
  });

  return {
    /**
     * `from` becomes `to` everywhere; onto an existing tag, the two merge. A
     * name a form would refuse rejects with `InvalidTagError`.
     */
    renameTag: async (from: string, to: string) => {
      const parsed = tagSchema.safeParse(to);
      if (!parsed.success) throw new InvalidTagError(parsed.error.issues[0]?.message);
      if (parsed.data === from) return { changed: 0, skipped: 0 };
      if (parsed.data === from) return { changed: 0, skipped: 0 };
      return await mutation.mutateAsync({
        tag: from,
        edit: (tags) => renameTagIn(tags, from, parsed.data),
      });
    },
    deleteTag: (tag: string) =>
      mutation.mutateAsync({ tag, edit: (tags) => removeTagFrom(tags, tag) }),
    pending: mutation.isPending,
  };
}

/**
 * The stored head rather than the list's copy, which a sync may have
 * overtaken: the tag edit must not write older content back.
 */
async function storedRecord(repository: RecordRepository, recordId: string) {
  const head = await repository.getById(recordId);
  if (!head || head.deleted_at) return undefined;
  const { schemaVersion: _schemaVersion, ...data } = decryptRecord(head);
  return { vaultId: head.vaultId, data: data as RecordData };
}

function withTags(record: RecordData, tags: string[]): RecordData {
  const { tags: _tags, ...data } = record;
  return (tags.length > 0 ? { ...data, tags } : data) as RecordData;
}

export function tagEditSummary(done: string, { changed, skipped }: TagEditResult): string {
  const summary = `${done} on ${itemCount(changed)}`;
  return skipped > 0 ? `${summary}. ${itemCount(skipped)} in read-only vaults kept it.` : summary;
}
