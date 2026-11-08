import { type ExportRecord, RECORD_TYPES } from "@repo/schema";
import { describe, expect, it } from "vitest";
import { buildExportData, exportToCsv } from "../src/export/export-file";
import { readImportFile } from "../src/import/read-import-file";

const VAULT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-08T12:00:00.000Z");
const meta = (n: number) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  vaultId: VAULT,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
});

const common = {
  note: "line 1\nline 2",
  tags: ["home", "work"],
  favorite: true,
  customFields: [{ type: "text" as const, title: "Account no.", value: "42" }],
};

const records: ExportRecord[] = [
  {
    type: "login",
    ...meta(1),
    ...common,
    title: "Mail, private",
    username: "me",
    email: "me@example.com",
    password: 'p"w,1',
    websites: [{ value: "https://mail.example.com" }, { value: "https://example.com" }],
    totp: "JBSWY3DPEHPK3PXP",
  },
  {
    type: "card",
    ...meta(2),
    ...common,
    title: "Visa",
    cardholderName: "Me",
    number: "4111111111111111",
    expiry: "01/30",
    securityCode: "123",
    pin: "0000",
  },
  {
    type: "identity",
    ...meta(3),
    ...common,
    title: "Me",
    firstName: "A",
    lastName: "B",
    email: "a@example.com",
    phone: "123",
    birthDate: "1990-01-01",
    street: "Main St 1",
    postalCode: "12345",
    city: "Town",
    country: "DE",
  },
  { type: "note", ...meta(4), ...common, title: "Secret note" },
  {
    type: "ssh_key",
    ...meta(5),
    ...common,
    title: "Server key",
    privateKey: "-----BEGIN KEY-----\nabc: def\nxyz\n-----END KEY-----",
    publicKey: "ssh-ed25519 AAAA",
    passphrase: "pp",
  },
  { type: "api_key", ...meta(6), ...common, title: "API", keyId: "id", secret: "s3", host: "h" },
  {
    type: "wifi",
    ...meta(7),
    ...common,
    title: "Home",
    ssid: "home-net",
    password: "wifi-secret",
    security: "wpa3",
    hidden: true,
  },
];

const bytes = (text: string) => new TextEncoder().encode(text);

function importCsv(rows: ExportRecord[]) {
  const csv = exportToCsv(
    buildExportData([{ id: VAULT, name: "Personal", kind: "personal" }], rows, NOW),
  );
  const contents = readImportFile(bytes(csv));
  if (contents.kind !== "foreign") throw new Error(contents.kind);
  return contents.foreign;
}

describe("import from the app's own CSV export", () => {
  it("covers every record type in this test", () => {
    expect(records.map((r) => r.type).sort()).toEqual([...RECORD_TYPES].sort());
  });

  it("round-trips every record type as new records in one vault", () => {
    const { data, source, report, vaultId } = importCsv(records);
    expect(source).toBe("passmgr");
    expect(report.skipped).toEqual([]);
    expect(data.vaults).toHaveLength(1);
    expect(data.records).toHaveLength(records.length);
    for (const [i, original] of records.entries()) {
      const imported = data.records[i]!;
      const { id: _id, vaultId: _v, updatedAt: _u, ...expected } = original;
      const { id, vaultId: recordVault, updatedAt: _updated, ...actual } = imported;
      expect(actual).toEqual(expected);
      expect(id).not.toBe(original.id);
      expect(recordVault).toBe(vaultId);
    }
  });

  it("undoes the formula escaping", () => {
    const { data } = importCsv([
      { type: "note", ...meta(1), title: "=SUM(A1)", note: "@home", tags: ["-x"] },
    ]);
    expect(data.records[0]).toMatchObject({ title: "=SUM(A1)", note: "@home", tags: ["-x"] });
  });

  it("keeps a title that starts with a quote of its own", () => {
    const { data } = importCsv([{ type: "note", ...meta(1), title: "'quoted" }]);
    expect(data.records[0]!.title).toBe("'quoted");
  });

  it("skips a row of an unknown type", () => {
    const csv = "vault,type,title\r\nPersonal,passkey,Thing\r\n";
    const contents = readImportFile(bytes(csv));
    if (contents.kind !== "foreign") throw new Error(contents.kind);
    expect(contents.foreign.report.skipped).toEqual([
      { title: "Thing", reason: "unsupported_type" },
    ]);
  });
});
