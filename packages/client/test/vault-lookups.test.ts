import type { VaultRole } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { type VaultInfo, vaultLookups } from "../src/vaults/vault-info";

const vault = (vaultId: string, role: VaultRole): VaultInfo => ({
  vaultId,
  role,
  kind: "shared",
  name: vaultId,
});

describe("vaultLookups canWrite", () => {
  const { canWrite } = vaultLookups([
    vault("owned", "owner"),
    vault("managed", "manage"),
    vault("written", "write"),
    vault("read", "read"),
  ]);

  it("allows every role but read", () => {
    expect(canWrite("owned")).toBe(true);
    expect(canWrite("managed")).toBe(true);
    expect(canWrite("written")).toBe(true);
    expect(canWrite("read")).toBe(false);
  });

  it("allows a vault not listed yet: the server checks every change", () => {
    expect(canWrite("unknown")).toBe(true);
  });
});
