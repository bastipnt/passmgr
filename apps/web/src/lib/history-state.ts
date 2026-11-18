/** `history.state` as a record, or undefined when an entry holds none (or something else). */
export function historyState(): Record<string, unknown> | undefined {
  const state: unknown = history.state;
  return typeof state === "object" && state !== null
    ? (state as Record<string, unknown>)
    : undefined;
}
