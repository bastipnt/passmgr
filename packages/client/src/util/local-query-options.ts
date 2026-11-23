/**
 * For a query or mutation that reads or writes the local vault first (ADR 0001 D1): never paused
 * while the browser reports offline. A server call inside it fails on its own, or checks the mode.
 * Also for a server-only mutation (`use-sessions`): it should fail at once offline, not pause and
 * resume later.
 */
export const localQueryOptions = { networkMode: "always" } as const;
