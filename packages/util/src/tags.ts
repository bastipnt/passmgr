/** Trimmed, inner whitespace collapsed to one space; the casing stays. */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

/** Tags are compared without case: "Work" and "work" are one tag. */
export function tagKey(tag: string): string {
  return normalizeTag(tag).toLocaleLowerCase();
}
