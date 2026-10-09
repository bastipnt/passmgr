import { describe, expect, it } from "vitest";
import type { SyncStatus } from "../src/sync-manager";
import { formatLastSynced, summarizeSync } from "../src/sync-summary";

const idle: SyncStatus = {
  phase: "idle",
  pending: 0,
  parked: 0,
  error: null,
  lastSyncedAt: null,
  enabled: true,
};

describe("summarizeSync", () => {
  it("a local vault has nothing to sync, whatever the status says", () => {
    expect(summarizeSync("local", { ...idle, phase: "error", parked: 2 }, false).state).toBe(
      "local",
    );
  });

  it("parked changes win over every other state", () => {
    const summary = summarizeSync("offline", { ...idle, phase: "offline", parked: 1 }, true);
    expect(summary.state).toBe("error");
    expect(summary.detail).toContain("1 change couldn't");
  });

  it("a failed round is an error only while there is a server to reach", () => {
    expect(summarizeSync("online", { ...idle, phase: "error" }, false).state).toBe("error");
    expect(summarizeSync("online", { ...idle, phase: "error" }, true).state).toBe("offline");
  });

  it("offline counts the changes waiting on this device", () => {
    const summary = summarizeSync("online", { ...idle, phase: "offline", pending: 3 }, true);
    expect(summary).toMatchObject({ state: "offline", title: "Offline" });
    expect(summary.detail).toContain("3 changes saved on this device");
  });

  it("a linked vault without a server session is not connected, though the network is up", () => {
    expect(summarizeSync("offline", idle, false)).toMatchObject({
      state: "offline",
      title: "Not connected",
    });
  });

  it("online with the manager not enabled yet is about to sync, not offline", () => {
    const starting = { ...idle, phase: "offline" as const, enabled: false };
    expect(summarizeSync("online", starting, false).state).toBe("synced");
    expect(summarizeSync("online", { ...starting, pending: 1 }, false).state).toBe("pending");
    // Enabled, a round that didn't get through: the server is out of reach.
    expect(summarizeSync("online", { ...starting, enabled: true }, false).title).toBe(
      "Not connected",
    );
  });

  it("syncing, pending and synced", () => {
    expect(summarizeSync("online", { ...idle, phase: "syncing", pending: 1 }, false).state).toBe(
      "syncing",
    );
    expect(summarizeSync("online", { ...idle, pending: 2 }, false).title).toBe("2 changes waiting");
    expect(summarizeSync("online", idle, false).state).toBe("synced");
  });
});

describe("formatLastSynced", () => {
  const now = 1_000_000_000_000;
  it.each([
    [10_000, "Last synced just now"],
    [5 * 60_000, "Last synced 5 minutes ago"],
    [3 * 3_600_000, "Last synced 3 hours ago"],
    [2 * 86_400_000, "Last synced 2 days ago"],
  ])("%i ms ago → %s", (ago, text) => {
    expect(formatLastSynced(now - ago, now)).toBe(text);
  });
});
