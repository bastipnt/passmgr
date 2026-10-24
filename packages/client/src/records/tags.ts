import { type DecryptedRecord, normalizeTags, tagKey } from "@repo/schema";

export type TagCount = { tag: string; count: number };

/**
 * Every tag on `records` with how many carry it, A–Z. Tags match without case;
 * each is shown in its most used spelling.
 */
export function collectTags(records: readonly DecryptedRecord[]): TagCount[] {
  const byKey = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const record of records) {
    for (const tag of normalizeTags(record.tags)) {
      const key = tag.toLocaleLowerCase();
      const entry = byKey.get(key) ?? { count: 0, spellings: new Map() };
      entry.count += 1;
      entry.spellings.set(tag, (entry.spellings.get(tag) ?? 0) + 1);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()]
    .map(({ count, spellings }) => ({
      tag: [...spellings].reduce((best, next) => (next[1] > best[1] ? next : best))[0],
      count,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }));
}

export function hasTag(record: Pick<DecryptedRecord, "tags">, tag: string): boolean {
  const key = tagKey(tag);
  return (record.tags ?? []).some((own) => tagKey(own) === key);
}

/** The records carrying every tag in `tags`; with none, every record. */
export function filterByTags(
  records: DecryptedRecord[],
  tags: readonly string[],
): DecryptedRecord[] {
  return tags.length === 0
    ? records
    : records.filter((record) => tags.every((tag) => hasTag(record, tag)));
}

/** `tags` with `from` renamed to `to`; onto a tag it already has, the two merge. */
export function renameTagIn(tags: readonly string[], from: string, to: string): string[] {
  const key = tagKey(from);
  return normalizeTags(tags.map((tag) => (tagKey(tag) === key ? to : tag)));
}

export function removeTagFrom(tags: readonly string[], tag: string): string[] {
  const key = tagKey(tag);
  return normalizeTags(tags.filter((own) => tagKey(own) !== key));
}

/** Tags added and removed from `previous` to `next`, and ones whose spelling changed. */
export function diffTags(
  previous: readonly string[] | undefined,
  next: readonly string[] | undefined,
): { added: string[]; removed: string[]; respelled: { from: string; to: string }[] } {
  const before = new Map(normalizeTags(previous).map((tag) => [tagKey(tag), tag]));
  const after = new Map(normalizeTags(next).map((tag) => [tagKey(tag), tag]));
  return {
    added: [...after].filter(([key]) => !before.has(key)).map(([, tag]) => tag),
    removed: [...before].filter(([key]) => !after.has(key)).map(([, tag]) => tag),
    respelled: [...after].flatMap(([key, to]) => {
      const from = before.get(key);
      return from !== undefined && from !== to ? [{ from, to }] : [];
    }),
  };
}
