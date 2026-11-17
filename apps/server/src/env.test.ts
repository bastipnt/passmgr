import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const valid = {
  OPAQUE_OPRF_SEED: randomBytes(32).toString("base64"),
  OPAQUE_AKE_PRIVATE_KEY: randomBytes(32).toString("base64"),
  OPAQUE_SERVER_SETUP: randomBytes(32).toString("base64"),
};

describe("parseServerEnv", () => {
  it("accepts a complete development config", () => {
    const env = parseServerEnv(valid);
    expect(env.production).toBe(false);
    expect(env.PREFIX).toBeUndefined();
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["shorter than 32 bytes", randomBytes(16).toString("base64")],
    ["blank", " ".repeat(40)],
  ])("refuses an OPAQUE_SERVER_SETUP that is %s", (_, value) => {
    expect(() => parseServerEnv({ ...valid, OPAQUE_SERVER_SETUP: value })).toThrow(
      /OPAQUE_SERVER_SETUP/,
    );
  });

  it("uses OPAQUE_SERVER_SETUP as given, whatever its encoding", () => {
    const hex = `${randomBytes(32).toString("hex")}\n`;
    expect(parseServerEnv({ ...valid, OPAQUE_SERVER_SETUP: hex }).OPAQUE_SERVER_SETUP).toBe(hex);
  });

  it.each([
    ["unset", undefined],
    ["not base64", "%".repeat(44)],
    ["the wrong length", randomBytes(16).toString("base64")],
  ])("refuses OPAQUE secrets that are %s", (_, value) => {
    expect(() => parseServerEnv({ ...valid, OPAQUE_OPRF_SEED: value })).toThrow(/OPAQUE_OPRF_SEED/);
    expect(() => parseServerEnv({ ...valid, OPAQUE_AKE_PRIVATE_KEY: value })).toThrow(
      /OPAQUE_AKE_PRIVATE_KEY/,
    );
  });

  it("treats a blank PREFIX as unset", () => {
    expect(parseServerEnv({ ...valid, PREFIX: " " }).PREFIX).toBeUndefined();
  });

  it("defaults STORAGE_QUOTA_MB and refuses a non-positive one", () => {
    expect(parseServerEnv(valid).STORAGE_QUOTA_MB).toBe(100);
    expect(parseServerEnv({ ...valid, STORAGE_QUOTA_MB: " 5 " }).STORAGE_QUOTA_MB).toBe(5);
    for (const bad of ["0", "-1", "lots"]) {
      expect(() => parseServerEnv({ ...valid, STORAGE_QUOTA_MB: bad })).toThrow(/STORAGE_QUOTA_MB/);
    }
  });

  it("defaults KEY_SET_RETENTION_DAYS and refuses a negative, fractional or huge one", () => {
    expect(parseServerEnv(valid).KEY_SET_RETENTION_DAYS).toBe(14);
    expect(parseServerEnv({ ...valid, KEY_SET_RETENTION_DAYS: "0" }).KEY_SET_RETENTION_DAYS).toBe(
      0,
    );
    for (const bad of ["-1", "1.5", "soon", "999999999"]) {
      expect(() => parseServerEnv({ ...valid, KEY_SET_RETENTION_DAYS: bad })).toThrow(
        /KEY_SET_RETENTION_DAYS/,
      );
    }
  });

  it("requires PREFIX in production", () => {
    expect(() => parseServerEnv({ ...valid, NODE_ENV: "production" })).toThrow(/PREFIX/);
    expect(() => parseServerEnv({ ...valid, NODE_ENV: "production", PREFIX: "/" })).toThrow(
      /PREFIX/,
    );
    expect(parseServerEnv({ ...valid, NODE_ENV: "production", PREFIX: "/trpc" })).toMatchObject({
      production: true,
      PREFIX: "/trpc",
    });
  });

  it("refuses a TRUST_PROXY hop count", () => {
    expect(() => parseServerEnv({ ...valid, TRUST_PROXY: "1" })).toThrow(/TRUST_PROXY/);
    expect(parseServerEnv({ ...valid, TRUST_PROXY: "loopback,uniquelocal" }).TRUST_PROXY).toBe(
      "loopback,uniquelocal",
    );
  });

  it("puts the ops routes on their own port, never PORT", () => {
    const env = parseServerEnv(valid);
    expect(env).toMatchObject({ HOST: "0.0.0.0", PORT: 3000, OPS_HOST: "0.0.0.0", OPS_PORT: 3001 });
    expect(parseServerEnv({ ...valid, HOST: "127.0.0.1" }).OPS_HOST).toBe("127.0.0.1");
    expect(() => parseServerEnv({ ...valid, OPS_PORT: "3000" })).toThrow(/OPS_PORT/);
    expect(() => parseServerEnv({ ...valid, OPS_PORT: "70000" })).toThrow(/OPS_PORT/);
  });

  it("knows APP_VERSION and CLIENT_VERSIONS without their leading v", () => {
    const env = parseServerEnv({
      ...valid,
      APP_VERSION: "v2.0.0",
      CLIENT_VERSIONS: " 1.9.0, v1.8.1 ,",
    });
    expect(env.clientVersions).toEqual(new Set(["2.0.0", "1.9.0", "1.8.1"]));
    expect(parseServerEnv(valid).clientVersions).toEqual(new Set());
    expect(() => parseServerEnv({ ...valid, CLIENT_VERSIONS: "v1.0.0,latest" })).toThrow(
      /CLIENT_VERSIONS/,
    );
    expect(parseServerEnv({ ...valid, APP_VERSION: "v1.4.0-rc.1" }).clientVersions).toEqual(
      new Set(),
    );
  });
});
