import { describe, expect, it } from "vitest";
import { chunkByParams, columnCount, MAX_BOUND_PARAMS } from "../src/schema/chunk-by-params";
import { breachChecks } from "../src/schema/tables";

describe("chunkByParams", () => {
  it("keeps every chunk within the bound-parameter budget", () => {
    const items = Array.from({ length: 1201 }, (_, i) => i);

    const chunks = chunkByParams(items, 12);

    expect(chunks.map((c) => c.length)).toEqual([500, 500, 201]);
    for (const chunk of chunks) expect(chunk.length * 12).toBeLessThanOrEqual(MAX_BOUND_PARAMS);
    expect(chunks.flat()).toEqual(items);
  });

  it("fills a chunk to the budget for one parameter per item", () => {
    const items = Array.from({ length: MAX_BOUND_PARAMS + 1 }, (_, i) => i);

    expect(chunkByParams(items, 1).map((c) => c.length)).toEqual([MAX_BOUND_PARAMS, 1]);
  });

  it("leaves room for the statement's own fixed parameters", () => {
    const items = Array.from({ length: MAX_BOUND_PARAMS }, (_, i) => i);

    const chunks = chunkByParams(items, 1, 1);

    expect(chunks.map((c) => c.length)).toEqual([MAX_BOUND_PARAMS - 1, 1]);
    expect(chunkByParams(items, 2, 1)[0]).toHaveLength((MAX_BOUND_PARAMS - 2) / 2);
  });

  it("returns no chunks for no items", () => {
    expect(chunkByParams([], 3)).toEqual([]);
  });

  it("counts one parameter per table column", () => {
    expect(columnCount(breachChecks)).toBe(6);
  });

  it("rejects a parameter count that isn't a positive integer", () => {
    expect(() => chunkByParams([1], 0)).toThrow(RangeError);
    expect(() => chunkByParams([1], 1.5)).toThrow(RangeError);
    expect(() => chunkByParams([1], 1, -1)).toThrow(RangeError);
    expect(() => chunkByParams([1], 1, MAX_BOUND_PARAMS)).toThrow(RangeError);
  });
});
