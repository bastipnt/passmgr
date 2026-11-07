import { Registry } from "@prometheus-io/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerActiveUsersGauge } from "./active-users";
import { redis } from "./redis";
import * as redisUtils from "./util/redis-utils";

beforeEach(async () => {
  await redis.flushall();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("passmgr_active_users", () => {
  it("exposes distinct active users per window", async () => {
    const registry = new Registry();
    registerActiveUsersGauge(registry);
    await redisUtils.recordActiveUser("alice");
    await redisUtils.recordActiveUser("bob");
    await redisUtils.recordActiveUser("alice");

    const text = await registry.metrics();
    expect(text).toContain('passmgr_active_users{window="1d"} 2');
    expect(text).toContain('passmgr_active_users{window="30d"} 2');
  });

  it("drops the series instead of failing the scrape when Redis errors", async () => {
    const registry = new Registry();
    const onError = vi.fn();
    registerActiveUsersGauge(registry, onError);
    vi.spyOn(redisUtils, "countActiveUsers").mockRejectedValue(new Error("redis down"));

    const text = await registry.metrics();
    expect(text).not.toMatch(/passmgr_active_users\{/);
    expect(onError).toHaveBeenCalledOnce();
  });
});
