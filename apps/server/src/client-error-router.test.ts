import { describe, expect, it } from "vitest";
import { buildTestContext } from "../test/setup/test-context";
import { metricsRegistry } from "./metrics";
import { appRouter } from "./router";
import { createCallerFactory } from "./trpc";

const caller = createCallerFactory(appRouter)(buildTestContext(undefined));

const report = { kind: "render", area: "records", platform: "web", version: "v1.2.3" } as const;

async function clientErrorMetric() {
  return (await metricsRegistry.getMetricsAsJSON()).find(
    (metric) => metric.name === "passmgr_client_errors_total",
  );
}

describe("clientError.report", () => {
  it("counts a crash without a session, labelled by kind, area, platform and version", async () => {
    await caller.clientError.report(report);
    const metric = await clientErrorMetric();
    expect(metric?.values).toContainEqual(
      expect.objectContaining({
        labels: { kind: "render", area: "records", platform: "web", version: "v1.2.3" },
        value: 1,
      }),
    );
  });

  it("rejects anything outside the enums, including free text and extra fields", async () => {
    const bad = [
      { ...report, kind: "Error: password hunter2" },
      { ...report, area: "/record/123" },
      { ...report, version: "1.2.3-hunter2" },
      { ...report, message: "hunter2" },
    ];
    for (const input of bad) {
      await expect(caller.clientError.report(input as never)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("keeps the series count bounded: unseen versions collapse to `other` past the cap", async () => {
    for (let minor = 0; minor < 40; minor++) {
      await caller.clientError.report({ ...report, version: `v9.${minor}.0` });
    }
    const metric = await clientErrorMetric();
    const versions = new Set(metric?.values.map((value) => value.labels.version));
    expect(versions.size).toBeLessThanOrEqual(21);
    expect(versions.has("other")).toBe(true);
  });
});
