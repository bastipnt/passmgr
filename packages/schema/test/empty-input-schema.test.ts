import { describe, expect, it } from "vitest";
import { emptyInputSchema } from "../src/empty-input-schema";

describe("emptyInputSchema", () => {
  it.each([[{}], [undefined]])("takes %o", (input) => {
    expect(emptyInputSchema.safeParse(input).success).toBe(true);
  });

  it("refuses any field", () => {
    expect(emptyInputSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});
