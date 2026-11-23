import { DEVICE_LOGIN_TTL_MS } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { PREPARED_MAX_AGE_MS } from "../src/hooks/use-device-login";

describe("PREPARED_MAX_AGE_MS", () => {
  it("drops a prepared device login before the server forgets it", () => {
    expect(PREPARED_MAX_AGE_MS).toBeGreaterThan(0);
    expect(PREPARED_MAX_AGE_MS).toBeLessThan(DEVICE_LOGIN_TTL_MS);
  });
});
