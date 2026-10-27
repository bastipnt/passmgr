import { generateSshKeyPair } from "@repo/crypto";
import type { DecryptedRecord, RecordData } from "@repo/schema";
import { describe, expect, it } from "vitest";
import {
  apiSecretPrefix,
  birthDateDisplay,
  cardExpiryStatus,
  maskedCardNumber,
  recordDetailLayout,
  sshKeyTypeLabel,
  sshPrivateKeyFileName,
} from "../src/records/record-detail";

const NOW = new Date(2026, 9, 27);

function decrypted(data: RecordData): DecryptedRecord {
  return {
    ...data,
    schemaVersion: 1,
    recordId: "r1",
    vaultId: "v1",
    version: 1,
    clientUpdatedAt: "2026-10-27T10:00:00.000Z",
    created_at: null,
    firstCreatedAt: null,
  } as DecryptedRecord;
}

function rowKeys(data: RecordData) {
  const [section] = recordDetailLayout(decrypted(data), NOW).sections;
  return section?.kind === "fields" ? section.rows.map((row) => row.map((field) => field.key)) : [];
}

describe("recordDetailLayout", () => {
  it("pairs fields where the form pairs them and keeps a login's empty slots", () => {
    expect(rowKeys({ type: "login", title: "GitHub", email: "a@b.c" })).toEqual([
      ["username", "email"],
      ["password"],
    ]);
    expect(
      rowKeys({
        type: "card",
        title: "Visa",
        cardholderName: "Lin Park",
        number: "4111111111111111",
        expiry: "08/28",
        securityCode: "123",
        pin: "1234",
      }),
    ).toEqual([
      ["cardholderName", "number"],
      ["expiry", "securityCode", "pin"],
    ]);
  });

  it("leaves empty fields out of their row", () => {
    expect(
      rowKeys({ type: "identity", title: "Lin", firstName: "Lin", phone: "+49", birthDate: "" }),
    ).toEqual([["firstName"], ["phone"]]);
  });

  it("gives a card number its network, a masked preview and the expiry a chip", () => {
    const layout = recordDetailLayout(
      decrypted({ type: "card", title: "Visa", number: "4111111111111111", expiry: "12/26" }),
      NOW,
    );
    const [section] = layout.sections;
    const fields = section?.kind === "fields" ? section.rows.flat() : [];
    expect(fields[0]).toMatchObject({
      key: "number",
      mono: true,
      badge: "Visa",
      maskedValue: "4111 •••• •••• 1111",
      copyValue: "4111111111111111",
    });
    expect(fields[1]).toMatchObject({
      key: "expiry",
      status: { label: "2 mo left", tone: "warning" },
    });
  });

  it("puts the address in a section of its own as envelope lines", () => {
    const { sections } = recordDetailLayout(
      decrypted({
        type: "identity",
        title: "Lin",
        firstName: "Lin",
        street: "Oranienstraße 42",
        postalCode: "10999",
        city: "Berlin",
        country: "Germany",
      }),
      NOW,
    );
    expect(sections.map((section) => section.title)).toEqual(["Personal info", "Address"]);
    expect(sections[1]).toMatchObject({
      lines: ["Oranienstraße 42", "10999 Berlin", "Germany"],
    });
  });

  it("starts an SSH key with its type and fingerprint, the private key blurred", () => {
    const pair = generateSshKeyPair();
    expect(rowKeys({ type: "ssh_key", title: "Deploy", ...pair, passphrase: "pass" })).toEqual([
      ["keyType", "fingerprint"],
      ["privateKey"],
      ["publicKey"],
      ["passphrase"],
    ]);
    const [section] = recordDetailLayout(
      decrypted({ type: "ssh_key", title: "Deploy", ...pair }),
      NOW,
    ).sections;
    const blocks = section?.kind === "fields" ? section.rows.flat().map((f) => f.block) : [];
    expect(blocks).toEqual([undefined, undefined, "blur", "code"]);
  });

  it("keeps an API secret's prefix visible and counts it", () => {
    const secret = `sk_live_${"a".repeat(24)}`;
    const [section] = recordDetailLayout(
      decrypted({
        type: "api_key",
        title: "Stripe",
        keyId: "pk_1",
        host: "api.stripe.com",
        secret,
      }),
      NOW,
    ).sections;
    const fields = section?.kind === "fields" ? section.rows : [];
    expect(fields.map((row) => row.map((f) => f.key))).toEqual([["keyId", "host"], ["secret"]]);
    expect(fields[1]?.[0]).toMatchObject({
      maskedValue: "sk_live_••••••••••••",
      hint: "32 characters",
    });
  });

  it("makes a hidden network a hint, not a row", () => {
    const { sections } = recordDetailLayout(
      decrypted({ type: "wifi", title: "Home", ssid: "Haus", security: "wpa2", hidden: true }),
      NOW,
    );
    const rows = sections[0]?.kind === "fields" ? sections[0].rows : [];
    expect(rows.map((row) => row.map((f) => f.key))).toEqual([["ssid", "security"]]);
    expect(rows[0]?.[1]?.hint).toBe("hidden network");
    expect(
      rowKeys({ type: "wifi", title: "Home", password: "correct-horse", hidden: true }),
    ).toEqual([["password"], ["hidden"]]);
  });

  it("puts a secure note's note first and pairs extra fields", () => {
    const layout = recordDetailLayout(
      decrypted({
        type: "note",
        title: "Seed",
        note: "orbit lunar",
        customFields: [
          { type: "text", title: "Device", value: "Ledger" },
          { type: "secret", title: "PIN", value: "1234" },
          { type: "text", title: "Place", value: "Safe" },
        ],
      }),
      NOW,
    );
    expect(layout).toMatchObject({ sections: [], noteFirst: true, note: "orbit lunar" });
    expect(layout.extraRows.map((row) => row.map((f) => [f.label, !!f.hiddenMark]))).toEqual([
      [
        ["Device", false],
        ["PIN", true],
      ],
      [["Place", false]],
    ]);
  });
});

describe("detail helpers", () => {
  it("rates the time left on a card", () => {
    expect(cardExpiryStatus("08/28", NOW)).toEqual({ label: "22 mo left", tone: "neutral" });
    expect(cardExpiryStatus("01/27", NOW)).toEqual({ label: "3 mo left", tone: "warning" });
    expect(cardExpiryStatus("10/26", NOW)).toEqual({
      label: "Expires this month",
      tone: "warning",
    });
    expect(cardExpiryStatus("09/26", NOW)).toEqual({ label: "Expired", tone: "danger" });
    expect(cardExpiryStatus("soon", NOW)).toBeUndefined();
  });

  it("masks only a plain card number", () => {
    expect(maskedCardNumber("378282246310005")).toBe("3782 •••• •••• 0005");
    expect(maskedCardNumber("see note")).toBeUndefined();
    expect(maskedCardNumber("4242")).toBeUndefined();
  });

  it("finds the kind prefix of an API secret", () => {
    expect(apiSecretPrefix(`sk_live_${"x".repeat(20)}`)).toBe("sk_live_");
    expect(apiSecretPrefix(`ghp_${"x".repeat(36)}`)).toBe("ghp_");
    expect(apiSecretPrefix(`xoxb-${"x".repeat(30)}`)).toBe("xoxb-");
    expect(apiSecretPrefix("ghp_short")).toBeUndefined();
    expect(apiSecretPrefix("a1b2c3d4e5f6g7h8i9j0")).toBeUndefined();
  });

  it("formats a birth date with the age it makes", () => {
    expect(birthDateDisplay("1991-03-14", NOW, "en-GB")).toEqual({
      date: "14 March 1991",
      age: "35 years",
    });
    expect(birthDateDisplay("1991-11-14", NOW, "en-GB")?.age).toBe("34 years");
    const [section] = recordDetailLayout(
      decrypted({ type: "identity", title: "Lin", birthDate: "1991-03-14" }),
      NOW,
    ).sections;
    expect(section?.kind === "fields" && section.rows[0]?.[0]?.copyValue).toBe("1991-03-14");
    expect(birthDateDisplay("spring 1991", NOW)).toBeUndefined();
    expect(birthDateDisplay("1991-02-30", NOW)).toBeUndefined();
  });

  it("names SSH key types", () => {
    expect(sshKeyTypeLabel("ssh-ed25519 AAAA")).toBe("Ed25519");
    expect(sshKeyTypeLabel("ssh-foo AAAA")).toBe("ssh-foo");
    expect(sshKeyTypeLabel(undefined)).toBeUndefined();
  });

  it("names a private key file like ssh-keygen", () => {
    expect(sshPrivateKeyFileName("ssh-ed25519 AAAA")).toBe("id_ed25519");
    expect(sshPrivateKeyFileName("sk-ecdsa-sha2-nistp256@openssh.com AAAA")).toBe("id_ecdsa_sk");
    expect(sshPrivateKeyFileName("ssh-dss AAAA")).toBe("id_dsa");
    expect(sshPrivateKeyFileName(undefined)).toBe("id_key");
  });
});
