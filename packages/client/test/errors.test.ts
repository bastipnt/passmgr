import { TRPCClientError } from "@trpc/client";
import { describe, expect, it } from "vitest";
import { createErrorReport, errorKind, userMessage } from "../src/errors";

function serverError(code: string, httpStatus: number, message = "raw server text") {
  return new TRPCClientError(message, {
    result: { error: { message, code: -1, data: { code, httpStatus } } } as never,
  });
}

describe("errorKind / userMessage", () => {
  it.each([
    ["UNAUTHORIZED", 401, "unauthorized"],
    ["TOO_MANY_REQUESTS", 429, "rate-limit"],
    ["PAYLOAD_TOO_LARGE", 413, "quota"],
    ["CONFLICT", 409, "conflict"],
    ["INTERNAL_SERVER_ERROR", 500, "unknown"],
  ] as const)("maps %s to %s", (code, status, kind) => {
    const err = serverError(code, status);
    expect(errorKind(err)).toBe(kind);
    expect(userMessage(err)).not.toContain("raw server text");
  });

  it("maps a request that never got an answer to offline", () => {
    expect(errorKind(new TRPCClientError("fetch failed", { cause: new TypeError("x") }))).toBe(
      "offline",
    );
    expect(errorKind(new TypeError("Failed to fetch"))).toBe("offline");
  });

  it("never echoes the message of an unknown error", () => {
    const err = new Error("password hunter2 is invalid");
    expect(errorKind(err)).toBe("unknown");
    expect(userMessage(err)).not.toContain("hunter2");
    expect(userMessage("a string")).toBe(userMessage(undefined));
  });
});

describe("createErrorReport", () => {
  const env = { appVersion: "1.2.3", platform: "web" };

  it("holds ID, version, platform, name, code and frames, but no message", () => {
    const err = serverError("CONFLICT", 409, "secret-value-123");
    const { id, details } = createErrorReport(err, env);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(details).toContain(`Error ID: ${id}`);
    expect(details).toContain("App version: 1.2.3");
    expect(details).toContain("Platform: web");
    expect(details).toContain("Error: TRPCClientError");
    expect(details).toContain("Code: CONFLICT");
    expect(details).toContain("Stack:");
    expect(details).not.toContain("secret-value-123");
  });

  it("drops message lines, even multi-line ones, from the stack", () => {
    const err = new Error("line one hunter2\nat position hunter2\n    at hunter2 (hunter2)");
    const { details } = createErrorReport(err, env);
    expect(details).not.toContain("hunter2");
  });

  it("copes with thrown non-errors and reuses the report per error object", () => {
    expect(createErrorReport("hunter2", env).details).not.toContain("hunter2");
    const err = new Error("x");
    expect(createErrorReport(err, env)).toBe(createErrorReport(err, env));
  });
});
