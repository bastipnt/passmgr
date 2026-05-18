import { describe, expect, it } from "vitest";
import { appConfigOutputSchema } from "../src/app-config-schema";

describe("appConfigOutputSchema", () => {
  it("accepts a valid config", () => {
    expect(() => appConfigOutputSchema.parse({ registrationEnabled: true })).not.toThrow();
    expect(() => appConfigOutputSchema.parse({ registrationEnabled: false })).not.toThrow();
  });

  it("rejects non-boolean registrationEnabled", () => {
    expect(() => appConfigOutputSchema.parse({ registrationEnabled: "yes" })).toThrow();
    expect(() => appConfigOutputSchema.parse({})).toThrow();
  });
});
