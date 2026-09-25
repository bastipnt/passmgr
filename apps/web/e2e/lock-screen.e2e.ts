import { test } from "@playwright/test";

// Idle lock exists now: `useIdleLock` in RecordLayout reloads the page after
// the configured idle time (Settings → Security, default 15 min) and `$mod+l`
// locks immediately. Enable once the test can shorten the timeout (e.g. by
// seeding the `pass-mgr-auto-lock` preference) and fake the clock.
test.skip("idle timeout locks vault and signed requests fail afterwards", () => {
  // intentionally empty
});
