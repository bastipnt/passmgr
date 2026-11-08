import { clientErrorInputSchema } from "@repo/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = { platform: "web", appVersion: "v1.2.3" } as const;
const occurrence = { kind: "render", area: "records" } as const;

type Module = typeof import("../src/errors/client-error-report");
let mod: Module;

beforeEach(async () => {
  vi.resetModules();
  mod = await import("../src/errors/client-error-report");
});

describe("reportClientError", () => {
  it("does nothing without an attached account session", () => {
    expect(() => mod.reportClientError(new Error("x"), occurrence, env)).not.toThrow();
  });

  it("sends only kind, area, platform and release: nothing from the error", () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    mod.setClientErrorSender(sender);
    mod.reportClientError(new Error("password hunter2"), occurrence, env);

    expect(sender).toHaveBeenCalledExactlyOnceWith({
      kind: "render",
      area: "records",
      platform: "web",
      version: "v1.2.3",
    });
    expect(clientErrorInputSchema.safeParse(sender.mock.calls[0]?.[0]).success).toBe(true);
  });

  it("reports a development build as `other`", () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    mod.setClientErrorSender(sender);
    mod.reportClientError(new Error("x"), occurrence, { ...env, appVersion: "dev" });
    expect(sender.mock.calls[0]?.[0]).toMatchObject({ version: "other" });
  });

  it("reports the same error once", () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    mod.setClientErrorSender(sender);
    const err = new Error("x");
    mod.reportClientError(err, occurrence, env);
    mod.reportClientError(err, occurrence, env);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("stops after a handful of reports", () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    mod.setClientErrorSender(sender);
    for (let i = 0; i < 20; i++) mod.reportClientError(new Error("x"), occurrence, env);
    expect(sender).toHaveBeenCalledTimes(5);
  });

  it("swallows a failing request", async () => {
    mod.setClientErrorSender(() => Promise.reject(new Error("offline")));
    expect(() => mod.reportClientError(new Error("x"), occurrence, env)).not.toThrow();
    await Promise.resolve();
  });
});
