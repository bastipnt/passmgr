import { normalizeTag, tagKey } from "@repo/util";
import { z } from "zod";

export { normalizeTag, tagKey };

export const MAX_TAG_LENGTH = 64;
export const MAX_TAGS = 32;

/** Normalized, blanks dropped, the first spelling of a tag kept. */
export function normalizeTags(tags: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags ?? []) {
    const tag = normalizeTag(raw);
    const key = tagKey(tag);
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/**
 * A tag from outside a form (an import): what the form would refuse is
 * repaired. The CSV export joins tags with ", ", so a comma would split it.
 */
export function sanitizeTag(tag: string): string {
  return normalizeTag(tag.replaceAll(",", " ")).slice(0, MAX_TAG_LENGTH).trimEnd();
}

export const tagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(
    z
      .string()
      .min(1, "A tag can't be empty")
      .max(MAX_TAG_LENGTH, `A tag has at most ${MAX_TAG_LENGTH} characters`)
      .refine((tag) => !tag.includes(","), "A tag can't contain a comma"),
  );

export const tagsFormSchema = z
  .array(tagSchema)
  .transform(normalizeTags)
  .pipe(z.array(z.string()).max(MAX_TAGS, `A record has at most ${MAX_TAGS} tags`));
