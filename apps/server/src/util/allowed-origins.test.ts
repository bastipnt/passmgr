import { describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "./allowed-origins";

describe("parseAllowedOrigins", () => {
  it("keeps exact origins from a comma-separated list", () => {
    expect(parseAllowedOrigins(" https://pass.example.com, http://localhost:3001/ ", true)).toEqual(
      new Set(["https://pass.example.com", "http://localhost:3001"]),
    );
  });

  it("normalises an origin the way browsers send it", () => {
    expect(parseAllowedOrigins("HTTPS://Pass.Example.com:443,https://bücher.de", true)).toEqual(
      new Set(["https://pass.example.com", "https://xn--bcher-kva.de"]),
    );
  });

  it("allows no localhost origin once one is configured", () => {
    expect(parseAllowedOrigins("https://pass.example.com", false)).toEqual(
      new Set(["https://pass.example.com"]),
    );
  });

  it("falls back to the local dev origins outside production", () => {
    expect(parseAllowedOrigins(undefined, false)).toContain("http://localhost:5173");
    expect(parseAllowedOrigins(" ", false)).toContain("http://localhost:8080");
  });

  it("refuses to start in production without one", () => {
    expect(() => parseAllowedOrigins(undefined, true)).toThrow(/CORS_ORIGIN/);
  });

  it.each([
    "pass.example.com",
    "https://pass.example.com/app",
    "https://user@pass.example.com",
    "https://pass.example.com/?x",
    "null",
    "file:///tmp",
    "https://*.example.com",
  ])("refuses %s", (entry) => {
    expect(() => parseAllowedOrigins(entry, true)).toThrow(/not an origin/);
  });
});
