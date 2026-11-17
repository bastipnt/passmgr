import { vaultMemberSchema } from "@repo/schema";
import { describe, expect, it } from "vitest";
import {
  InvalidServerResponseError,
  isServerAnswer,
  isServerError,
  parseServerResponse,
} from "../src/util/trpc-errors";

describe("parseServerResponse", () => {
  const member = {
    userId: "0199a3c4-0000-7000-8000-000000000001",
    email: "a@example.com",
    role: "read",
    status: "active",
    publicKey: { keyVersion: 1, publicKey: btoa("k".repeat(32)) },
  };

  it("hands back the parsed answer, unknown fields stripped", () => {
    expect(parseServerResponse(vaultMemberSchema, { ...member, extra: 1 })).toEqual(member);
  });

  it("throws InvalidServerResponseError for an answer the schema refuses", () => {
    expect(() => parseServerResponse(vaultMemberSchema, { ...member, role: "god" })).toThrow(
      InvalidServerResponseError,
    );
  });

  it("counts a malformed answer as the server failing, not as offline", () => {
    const error = new InvalidServerResponseError();

    expect(isServerAnswer(error)).toBe(true);
    expect(isServerError(error)).toBe(true);
  });
});
