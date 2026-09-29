/**
 * `secretsStore` is memory-only on web, so a reload drops every key. It also
 * discards unsaved sheet state, which is the right trade for a lock.
 */
export const lockVault = () => window.location.reload();
