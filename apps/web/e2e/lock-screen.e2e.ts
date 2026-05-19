import { test } from "@playwright/test";

test.skip("idle timeout locks vault and signed requests fail afterwards", // `secretsStore.lock()` exists in packages/store/src/secrets-store.ts:69 but
// is never invoked from the UI. There is no idle-timeout monitor, no Lock
// button, and no auto-lock on tab visibility change. Wire one of these
// (likely an idle-timer in StoreProvider that calls secretsStore.lock())
// before enabling this test.
() => {
  // intentionally empty
});
