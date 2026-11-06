import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_OVERRIDE_KEY, isDemoMode, toggleDemoOverride } from "./demo-mode";
import { createTapCounter } from "./use-demo-escape-hatch";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isDemoMode", () => {
  it("is off without the build flag, override or not", () => {
    vi.stubEnv("VITE_DEMO_MODE", "false");
    expect(isDemoMode()).toBe(false);
    localStorage.setItem(DEMO_OVERRIDE_KEY, "1");
    expect(isDemoMode()).toBe(false);
  });

  it("is on in a demo build until this browser turns it off, and on again", () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    expect(isDemoMode()).toBe(true);
    expect(toggleDemoOverride()).toBe(false);
    expect(localStorage.getItem(DEMO_OVERRIDE_KEY)).toBe("1");
    expect(isDemoMode()).toBe(false);
    expect(toggleDemoOverride()).toBe(true);
    expect(isDemoMode()).toBe(true);
  });

  it("stays on when storage can't be read", () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isDemoMode()).toBe(true);
  });
});

describe("createTapCounter", () => {
  it("fires on the seventh tap within the window", () => {
    const tap = createTapCounter();
    const results = [0, 300, 600, 900, 1200, 1500, 1800].map((t) => tap(t));
    expect(results).toEqual([false, false, false, false, false, false, true]);
  });

  it("starts over after a pause", () => {
    const tap = createTapCounter();
    for (const t of [0, 200, 400, 600, 800, 1000]) tap(t);
    expect(tap(2500)).toBe(false);
    for (const t of [2700, 2900, 3100, 3300, 3500]) expect(tap(t)).toBe(false);
    expect(tap(3700)).toBe(true);
  });

  it("doesn't fire when seven taps take longer than the window", () => {
    const tap = createTapCounter();
    const results = [0, 600, 1200, 1800, 2400, 3000, 3600].map((t) => tap(t));
    expect(results.at(-1)).toBe(false);
  });
});
