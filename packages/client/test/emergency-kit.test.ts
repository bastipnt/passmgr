import { inflateSync } from "node:zlib";
import { toBase64 } from "@repo/util";
import { describe, expect, it } from "vitest";
import {
  createEmergencyKit,
  emergencyKitFileName,
  recoveryKeyChunks,
} from "../src/account/emergency-kit";
import { parseRecoveryKey } from "../src/recover";

const recoveryKey = Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 3);
const createdAt = new Date(2026, 9, 11, 12, 0);

/** The text the page draws: standard-font text is written as hex strings in flate streams. */
function pageText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf).toString("latin1");
  const text: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1] ?? "", "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const hex of content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) {
      text.push(Buffer.from(hex[1] ?? "", "hex").toString("latin1"));
    }
  }
  return text.join("\n");
}

describe("recoveryKeyChunks", () => {
  it("splits the base64 key into four groups that parse back to the key", () => {
    const chunks = recoveryKeyChunks(recoveryKey);
    expect(chunks).toHaveLength(4);
    expect(chunks.join("")).toBe(toBase64(recoveryKey));
    expect(parseRecoveryKey(chunks.join("  "))).toEqual(recoveryKey);
  });
});

describe("createEmergencyKit", () => {
  it("prints the account's email, server and recovery key", async () => {
    const kit = await createEmergencyKit({
      recoveryKey,
      account: { email: "ada@example.com", serverUrl: "https://vault.example.com/api" },
      appUrl: "https://vault.example.com",
      createdAt,
    });

    expect(kit.fileName).toBe("passmgr-emergency-kit-2026-10-11.pdf");
    expect(Buffer.from(kit.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const text = pageText(kit.bytes);
    expect(text).toContain("ada@example.com");
    expect(text).toContain("https://vault.example.com/api");
    expect(text).toContain("https://vault.example.com");
    expect(text).toContain(recoveryKeyChunks(recoveryKey).join("  "));
    expect(text).toContain("Created 2026-10-11");
  });

  it("names no server for a local vault", async () => {
    const kit = await createEmergencyKit({ recoveryKey, name: "Home", createdAt });
    const text = pageText(kit.bytes);
    expect(text).toContain("A vault on this device only");
    expect(text).toContain("Home");
    expect(text).not.toContain("Server");
    expect(text).toContain(recoveryKeyChunks(recoveryKey).join("  "));
  });

  it("keeps the email out of the metadata", async () => {
    const kit = await createEmergencyKit({
      recoveryKey,
      account: { email: "ada@example.com", serverUrl: "https://vault.example.com" },
      createdAt,
    });
    const raw = Buffer.from(kit.bytes).toString("latin1");
    expect(raw).not.toContain("ada@example.com");
    expect(raw).not.toContain(toBase64(recoveryKey));
  });

  it("replaces characters the standard fonts can't encode", async () => {
    const kit = await createEmergencyKit({ recoveryKey, name: "Tresor 🔐 Zürich", createdAt });
    expect(pageText(kit.bytes)).toContain("Tresor ?? Zürich");
  });
});

describe("emergencyKitFileName", () => {
  it("uses the local date", () => {
    expect(emergencyKitFileName(new Date(2026, 0, 5, 23, 59))).toBe(
      "passmgr-emergency-kit-2026-01-05.pdf",
    );
  });
});
