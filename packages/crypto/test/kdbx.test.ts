import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isKdbx,
  type KdbxArgon2,
  type KdbxCredentials,
  KdbxInvalidKeyError,
  KdbxUnsupportedError,
  openKdbx,
} from "../src/kdbx";
import { argon2Async } from "../src/util/argon2-impl";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "fixtures/kdbx", name)));
const demoKey = fixture("kdbxweb-demo.key");

const protectedValues = (xml: string) =>
  [...xml.matchAll(/<Value ProtectInMemory="True">([^<]*)<\/Value>/g)].map((m) => m[1]);

describe("openKdbx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a KeePassXC database, values escaped", async () => {
    const xml = await openKdbx(fixture("keepassxc.kdbx"), { password: "correct horse" });

    expect(xml).toMatch(/^<\?xml/);
    expect(xml).toContain("<Value>alice@example.com</Value>");
    expect(protectedValues(xml)).toEqual(["second-pass", "hunter2 &amp; &lt;ok&gt;"]);
    expect(xml).not.toContain('Protected="True"');
  });

  it.each<[string, KdbxCredentials]>([
    ["kdbxweb-demo.kdbx", { password: "demo", keyFile: demoKey }],
    ["kdbxweb-AesChaCha.kdbx", { password: "demo", keyFile: demoKey }],
    ["kdbxweb-Argon2.kdbx", { password: "demo", keyFile: demoKey }],
    ["kdbxweb-Argon2id.kdbx", { password: "demo", keyFile: demoKey }],
    ["kdbxweb-Key32.kdbx", { password: "test", keyFile: fixture("kdbxweb-Key32.key") }],
    ["kdbxweb-Key64.kdbx", { password: "test", keyFile: fixture("kdbxweb-Key64.key") }],
    ["kdbxweb-binkey.kdbx", { password: "test", keyFile: fixture("kdbxweb-binkey.key") }],
    ["keyfile-v2.kdbx", { keyFile: fixture("keyfile-v2.keyx") }],
  ])("opens %s", async (name, credentials) => {
    const xml = await openKdbx(fixture(name), credentials);

    expect(xml).toContain("<KeePassFile>");
    expect(xml).toMatch(/<\/KeePassFile>\s*$/);
  });

  it("decrypts every protected value in document order (KDBX 3.1, Salsa20)", async () => {
    const xml = await openKdbx(fixture("kdbxweb-demo.kdbx"), {
      password: "demo",
      keyFile: demoKey,
    });

    expect(protectedValues(xml)).toEqual([
      "Password",
      "Password",
      "12345",
      "protected val",
      "mypass",
      "protected val",
      "pass",
      "mlrb0P6yZV743YeMfy7P",
    ]);
  });

  it("derives Argon2 through the given function, with the variant", async () => {
    const argon2 = vi.fn<KdbxArgon2>((password, salt, { variant, ...opts }) =>
      argon2Async(variant, password, salt, opts),
    );
    await openKdbx(fixture("kdbxweb-Argon2.kdbx"), { password: "demo", keyFile: demoKey }, argon2);
    await openKdbx(
      fixture("kdbxweb-Argon2id.kdbx"),
      { password: "demo", keyFile: demoKey },
      argon2,
    );

    expect(argon2.mock.calls.map(([, , params]) => params.variant)).toEqual([
      "argon2d",
      "argon2id",
    ]);
    expect(argon2.mock.calls[0]![0]).toHaveLength(32);
  });

  it("runs AES-KDF on @noble without WebCrypto", async () => {
    vi.stubGlobal("crypto", undefined);
    const xml = await openKdbx(fixture("kdbxweb-demo.kdbx"), {
      password: "demo",
      keyFile: demoKey,
    });

    expect(protectedValues(xml)[0]).toBe("Password");
  });

  it.each<[string, string, KdbxCredentials]>([
    ["KDBX 3.1", "kdbxweb-demo.kdbx", { password: "wrong", keyFile: demoKey }],
    ["KDBX 3.1 without the key file", "kdbxweb-demo.kdbx", { password: "demo" }],
    ["KDBX 4", "keepassxc.kdbx", { password: "correct horse!" }],
    ["KDBX 4 with Argon2", "kdbxweb-Argon2.kdbx", { password: "demo" }],
    ["no password and no key file", "keepassxc.kdbx", {}],
  ])("refuses a wrong key: %s", async (_name, file, credentials) => {
    await expect(openKdbx(fixture(file), credentials)).rejects.toBeInstanceOf(KdbxInvalidKeyError);
  });

  it.each([
    ["check hash doesn't match", (text: string) => text.replace(/Hash="\w+"/, 'Hash="00000000"')],
    ["data isn't hex", (text: string) => text.replace(/E0F69F62/, "XYZ")],
  ])("refuses a v2 key file whose %s", async (_name, change) => {
    const keyFile = new TextEncoder().encode(
      change(new TextDecoder().decode(fixture("keyfile-v2.keyx"))),
    );

    await expect(openKdbx(fixture("keyfile-v2.kdbx"), { keyFile })).rejects.toBeInstanceOf(
      KdbxInvalidKeyError,
    );
  });

  it("refuses what isn't a KDBX 3 or 4 database", async () => {
    const kdbx2 = fixture("kdbxweb-demo.kdbx");
    kdbx2[10] = 2;

    expect(isKdbx(new TextEncoder().encode("<KeePassFile>"))).toBe(false);
    await expect(openKdbx(new Uint8Array(16), { password: "" })).rejects.toBeInstanceOf(
      KdbxUnsupportedError,
    );
    await expect(openKdbx(kdbx2, { password: "demo" })).rejects.toThrow("KDBX 2");
  });

  it("refuses another cipher (Twofish)", async () => {
    const file = fixture("kdbxweb-demo.kdbx");
    // The cipher id is the first header field: id, u16 size, 16 bytes.
    file.set([0xad, 0x68, 0xf2, 0x9f], 15);

    await expect(openKdbx(file, { password: "demo", keyFile: demoKey })).rejects.toBeInstanceOf(
      KdbxUnsupportedError,
    );
  });

  it("tells a damaged file from a wrong key", async () => {
    const kdbx3 = fixture("keepassxc.kdbx");
    kdbx3[kdbx3.length >> 1]! ^= 1;
    const kdbx4Header = fixture("kdbxweb-Argon2.kdbx");
    kdbx4Header[50]! ^= 1;
    const kdbx4Block = fixture("kdbxweb-Argon2.kdbx");
    kdbx4Block[kdbx4Block.length >> 1]! ^= 1;
    const truncated = fixture("kdbxweb-Argon2.kdbx").subarray(0, 300);
    const kdbx3Truncated = fixture("keepassxc.kdbx").subarray(0, -5);

    for (const file of [kdbx3, kdbx4Header, kdbx4Block, truncated, kdbx3Truncated]) {
      const fromKeePassXc = file === kdbx3 || file === kdbx3Truncated;
      const password = fromKeePassXc ? "correct horse" : "demo";
      const error = await openKdbx(file, {
        password,
        keyFile: fromKeePassXc ? undefined : demoKey,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(KdbxInvalidKeyError);
      expect(error).not.toBeInstanceOf(KdbxUnsupportedError);
    }
  });
});
