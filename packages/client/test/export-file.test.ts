import {
  exportKdf,
  genSalt,
  getPasswordKekParams,
  retrievePRK,
  sealExport,
  setPasswordKekParams,
} from "@repo/crypto";
import type { ExportRecord, ExportVault } from "@repo/schema";
import { exportDataSchema, exportEnvelopeSchema } from "@repo/schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildExportData,
  decryptExport,
  exportFile,
  exportFileName,
  exportToCsv,
  exportToJson,
  InvalidExportFileError,
  WrongExportPasswordError,
} from "../src/export/export-file";

// The real Argon2 derivation, on the main thread (no workers here).
vi.mock("@repo/crypto/services/argon2-worker-service", () => ({
  argon2WorkerService: { derive: retrievePRK },
}));

const PERSONAL = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-08T12:00:00.000Z");

const vaults: ExportVault[] = [{ id: PERSONAL, name: "Personal", kind: "personal" }];

const login: ExportRecord = {
  type: "login",
  id: "22222222-2222-4222-8222-222222222222",
  vaultId: PERSONAL,
  title: "Mail, private",
  username: "me@example.com",
  password: 'p"w,1',
  websites: [{ value: "https://mail.example.com" }, { value: "https://example.com" }],
  totp: "JBSWY3DPEHPK3PXP",
  note: "line 1\nline 2",
  tags: ["mail", "home"],
  favorite: true,
  customFields: [{ type: "secret", title: "PIN", value: "1234" }],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

const wifi: ExportRecord = {
  type: "wifi",
  id: "33333333-3333-4333-8333-333333333333",
  vaultId: PERSONAL,
  title: "Home",
  ssid: "home-net",
  password: "wifi-secret",
  security: "wpa3",
  hidden: true,
  createdAt: null,
  updatedAt: "2026-10-03T00:00:00.000Z",
};

const data = buildExportData(vaults, [login, wifi], NOW);

/** Minimal RFC 4180 reader for the assertions. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += c;
  }
  return rows;
}

describe("export JSON", () => {
  it("matches the export schema and keeps every field", () => {
    const parsed = exportDataSchema.parse(JSON.parse(exportToJson(data)));
    expect(parsed).toEqual(data);
    expect(parsed).toMatchObject({
      format: "passmgr-export",
      version: 1,
      recordSchemaVersion: 1,
      exportedAt: NOW.toISOString(),
    });
  });
});

describe("export CSV", () => {
  const [header, loginRow, wifiRow] = parseCsv(exportToCsv(data)).map((cells, _, all) =>
    Object.fromEntries(all[0]!.map((column, i) => [column, cells[i]])),
  );

  it("has one header and one row per record", () => {
    expect(parseCsv(exportToCsv(data))).toHaveLength(3);
    expect(Object.keys(header!)).toEqual([
      "vault",
      "type",
      "title",
      "username",
      "password",
      "websites",
      "totp",
      "note",
      "fields",
      "customFields",
      "tags",
      "favorite",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(loginRow).toMatchObject({
      vault: "Personal",
      type: "login",
      title: "Mail, private",
      username: "me@example.com",
      password: 'p"w,1',
      websites: "https://mail.example.com\nhttps://example.com",
      note: "line 1\nline 2",
      customFields: "PIN: 1234",
      tags: "mail, home",
      favorite: "true",
      fields: "",
    });
  });

  it("escapes formulas in free text, never in credentials", () => {
    const formula: ExportRecord = {
      ...login,
      title: '=HYPERLINK("http://evil")',
      note: "@SUM(1)",
      tags: ["+1"],
      username: "-me",
      password: "=secret",
      customFields: [{ type: "text", title: "-x", value: "y" }],
    };
    const [, row] = parseCsv(exportToCsv(buildExportData(vaults, [formula], NOW)));
    const cells = Object.fromEntries(parseCsv(exportToCsv(data))[0]!.map((c, i) => [c, row![i]]));

    expect(cells).toMatchObject({
      title: '\'=HYPERLINK("http://evil")',
      note: "'@SUM(1)",
      tags: "'+1",
      customFields: "'-x: y",
      username: "-me",
      password: "=secret",
    });
  });

  it("puts other types' fields into `fields`, a password into its column", () => {
    expect(wifiRow).toMatchObject({
      type: "wifi",
      password: "wifi-secret",
      fields: "ssid: home-net\nsecurity: wpa3\nhidden: true",
      createdAt: "",
    });
  });
});

describe("encrypted export", () => {
  const previous = getPasswordKekParams();
  beforeAll(() => setPasswordKekParams({ t: 1, m: 8, p: 1 }));
  afterAll(() => setPasswordKekParams(previous));

  it("round-trips with the export password, no secret in the file", async () => {
    const file = await exportFile(data, "encrypted", "export password");

    expect(file.fileName).toBe(exportFileName("encrypted", NOW));
    expect(exportEnvelopeSchema.safeParse(JSON.parse(file.content)).success).toBe(true);
    expect(file.content).not.toContain("wifi-secret");
    expect(file.content).not.toContain("Personal");
    await expect(decryptExport(file.content, "export password")).resolves.toEqual(data);
  });

  it("refuses a wrong password", async () => {
    const file = await exportFile(data, "encrypted", "export password");
    await expect(decryptExport(file.content, "wrong")).rejects.toBeInstanceOf(
      WrongExportPasswordError,
    );
  });

  it("refuses a file that isn't an encrypted export", async () => {
    await expect(decryptExport(exportToJson(data), "x")).rejects.toBeInstanceOf(
      InvalidExportFileError,
    );
    await expect(decryptExport("not json", "x")).rejects.toBeInstanceOf(InvalidExportFileError);
  });

  it("reads back records an edit form would reject", async () => {
    const odd = {
      ...login,
      websites: [{ value: "not a url" }],
      customFields: [{ type: "text" as const, title: "", value: "" }],
    };
    const oddData = buildExportData(vaults, [odd], NOW);
    const file = await exportFile(oddData, "encrypted", "export password");

    await expect(decryptExport(file.content, "export password")).resolves.toEqual(oddData);
  });

  it("refuses an envelope whose content isn't export JSON", async () => {
    const kdf = exportKdf(genSalt(), getPasswordKekParams());
    const key = await retrievePRK(
      "export password",
      Uint8Array.from(atob(kdf.salt), (c) => c.charCodeAt(0)),
      kdf,
    );
    const file = JSON.stringify(sealExport(key, kdf, "not json"));

    await expect(decryptExport(file, "export password")).rejects.toBeInstanceOf(
      InvalidExportFileError,
    );
  });

  it("needs a password", async () => {
    await expect(exportFile(data, "encrypted")).rejects.toThrow();
  });
});

describe("exportFileName", () => {
  it("names backups and plain exports apart, by local date", () => {
    const date = new Date(2026, 9, 8, 23, 30);
    expect(exportFileName("encrypted", date)).toBe("passmgr-backup-2026-10-08.json");
    expect(exportFileName("json", date)).toBe("passmgr-export-2026-10-08.json");
    expect(exportFileName("csv", date)).toBe("passmgr-export-2026-10-08.csv");
  });
});
