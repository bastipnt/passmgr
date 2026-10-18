import { cbc } from "@noble/ciphers/aes.js";
import { chacha20 } from "@noble/ciphers/chacha.js";
import { salsa20 } from "@noble/ciphers/salsa.js";
import { equalBytes } from "@noble/ciphers/utils.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";
import { fromBase64 } from "@repo/util";
import { gunzipSync } from "fflate";
import { type Argon2Params, argon2Async } from "./util/argon2-impl";

/*
 * Reads a KeePass database (KDBX 3.1 and 4.x) into its inner XML, the format
 * of a KeePass XML export. Protected values come out decrypted, marked
 * `ProtectInMemory="True"` as an XML export marks them.
 */

export type KdbxCredentials = { password?: string; keyFile?: Uint8Array };

/** Argon2 over raw bytes; web passes its worker. */
export type KdbxArgon2 = (
  password: Uint8Array,
  salt: Uint8Array,
  params: Required<Argon2Params>,
) => Promise<Uint8Array>;

/** The password or key file is wrong. */
export class KdbxInvalidKeyError extends Error {
  constructor() {
    super("KdbxInvalidKeyError");
  }
}

/** A KeePass database this reader can't open (Twofish, KDBX before 3, Argon2 with a secret, …). */
export class KdbxUnsupportedError extends Error {
  constructor(what: string) {
    super(`KdbxUnsupportedError: ${what}`);
  }
}

export const KDBX_SIGNATURE = new Uint8Array([0x03, 0xd9, 0xa2, 0x9a, 0x67, 0xfb, 0x4b, 0xb5]);

const CIPHER_AES256 = "31c1f2e6bf714350be5805216afc5aff";
const CIPHER_CHACHA20 = "d6038a2b8b6f4cb5a524339a31dbb59a";
const KDF_AES = new Set(["c9d9f39a628a4460bf740d08c18a4fea", "7c02bb8279a74ac0927d114a00648238"]);
const KDF_ARGON2: Record<string, Argon2Params["variant"]> = {
  ef636ddf8c29444b91f7a9a403e30a0c: "argon2d",
  "9e298b1956db4773b23dfc3ec6f0a1e6": "argon2id",
};
const ARGON2_VERSION = 0x13;

const STREAM_NONE = 0;
const STREAM_SALSA20 = 2;
const STREAM_CHACHA20 = 3;
const SALSA20_NONCE = hexToBytes("e830094b97205d2a");

const HEADER_END = 0;
const Header = {
  CipherId: 2,
  Compression: 3,
  MasterSeed: 4,
  TransformSeed: 5,
  TransformRounds: 6,
  EncryptionIv: 7,
  ProtectedStreamKey: 8,
  StreamStartBytes: 9,
  InnerRandomStreamId: 10,
  KdfParameters: 11,
} as const;
const InnerHeader = { StreamId: 1, StreamKey: 2 } as const;

class Reader {
  private offset = 0;
  private readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get position() {
    return this.offset;
  }

  private take(length: number) {
    if (length < 0 || this.offset + length > this.bytes.length) throw new Error("KDBX truncated");
    const start = this.offset;
    this.offset += length;
    return start;
  }

  bytesOf(length: number) {
    const start = this.take(length);
    return this.bytes.subarray(start, start + length);
  }
  u8 = () => this.view.getUint8(this.take(1));
  u16 = () => this.view.getUint16(this.take(2), true);
  u32 = () => this.view.getUint32(this.take(4), true);
  i32 = () => this.view.getInt32(this.take(4), true);
  u64 = () => Number(this.view.getBigUint64(this.take(8), true));
  rest = () => this.bytesOf(this.bytes.length - this.offset);
}

const u32le = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
};
const u64le = (value: bigint) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
};
const readU32 = (bytes: Uint8Array) => new Reader(bytes).u32();
const readU64 = (bytes: Uint8Array) => new Reader(bytes).u64();

type Fields = Map<number, Uint8Array>;

function readFields(reader: Reader, sizeOf: () => number) {
  const fields: Fields = new Map();
  for (;;) {
    const id = reader.u8();
    const data = reader.bytesOf(sizeOf());
    if (id === HEADER_END) return fields;
    fields.set(id, data);
  }
}

function required(fields: Fields, id: number) {
  const value = fields.get(id);
  if (!value) throw new Error(`KDBX header field ${id} missing`);
  return value;
}

type Variant = Map<string, Uint8Array>;

function readVariantDictionary(bytes: Uint8Array): Variant {
  const reader = new Reader(bytes);
  if (reader.u16() >> 8 > 1) throw new KdbxUnsupportedError("KDF parameters version");
  const dictionary: Variant = new Map();
  for (;;) {
    const type = reader.u8();
    if (type === 0) return dictionary;
    const key = new TextDecoder().decode(reader.bytesOf(reader.i32()));
    dictionary.set(key, reader.bytesOf(reader.i32()));
  }
}

/** KeePass key file: XML (v1 base64, v2 hex with a check hash), 32 raw bytes, 64 hex chars, or else its SHA-256. */
function keyFileKey(file: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(file);
  const data = /<KeyFile[\s>][\s\S]*<Data(?:\s+Hash="([0-9a-fA-F]+)")?\s*>([^<]*)<\/Data>/.exec(
    text,
  );
  if (data) {
    const version = /<Version>\s*(\d+)/.exec(text)?.[1];
    if (version === "2") {
      const hex = data[2]!.replace(/\s+/g, "");
      if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new KdbxInvalidKeyError();
      const key = hexToBytes(hex);
      if (data[1] && bytesToHex(sha256(key).subarray(0, 4)) !== data[1].toLowerCase())
        throw new KdbxInvalidKeyError();
      return key;
    }
    return fromBase64(data[2]!.trim());
  }
  if (file.length === 32) return file;
  if (file.length === 64 && /^[0-9a-fA-F]{64}$/.test(text)) return hexToBytes(text);
  return sha256(file);
}

function compositeKey({ password, keyFile }: KdbxCredentials): Uint8Array {
  const parts: Uint8Array[] = [];
  if (password !== undefined) parts.push(sha256(new TextEncoder().encode(password)));
  if (keyFile) parts.push(keyFileKey(keyFile));
  if (parts.length === 0) throw new KdbxInvalidKeyError();
  return sha256(concatBytes(...parts));
}

const AES_KDF_CHUNK_BLOCKS = 1 << 18;

/**
 * AES-KDF encrypts each half of the key `rounds` times with AES-ECB. That
 * chain is AES-CBC over zero blocks with the half as IV: its last block.
 * Chunked, yielding in between, so a high round count doesn't freeze the page.
 */
async function aesKdf(key: Uint8Array, seed: Uint8Array, rounds: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  const aesKey =
    subtle && (await subtle.importKey("raw", seed.slice(), "AES-CBC", false, ["encrypt"]));
  const encryptChain = async (iv: Uint8Array<ArrayBuffer>, blocks: number) => {
    const zeros = new Uint8Array(blocks * 16);
    if (aesKey) {
      // WebCrypto pads: one extra block after the chain.
      const out = new Uint8Array(await subtle.encrypt({ name: "AES-CBC", iv }, aesKey, zeros));
      return out.slice(blocks * 16 - 16, blocks * 16);
    }
    return cbc(seed, iv, { disablePadding: true }).encrypt(zeros).slice(-16);
  };
  const halves = [key.slice(0, 16), key.slice(16, 32)];
  for (let i = 0; i < halves.length; i++) {
    for (let done = 0; done < rounds; done += AES_KDF_CHUNK_BLOCKS) {
      halves[i] = await encryptChain(halves[i]!, Math.min(AES_KDF_CHUNK_BLOCKS, rounds - done));
      await new Promise((resolve) => setTimeout(resolve));
    }
  }
  return sha256(concatBytes(...halves));
}

async function transformKey(
  key: Uint8Array,
  fields: Fields,
  major: number,
  argon2: KdbxArgon2,
): Promise<Uint8Array> {
  if (major === 3) {
    const rounds = readU64(required(fields, Header.TransformRounds));
    return aesKdf(key, required(fields, Header.TransformSeed), rounds);
  }
  const kdf = readVariantDictionary(required(fields, Header.KdfParameters));
  const get = (name: string) => {
    const value = kdf.get(name);
    if (!value) throw new Error(`KDF parameter ${name} missing`);
    return value;
  };
  const uuid = bytesToHex(get("$UUID"));
  if (KDF_AES.has(uuid)) return aesKdf(key, get("S"), readU64(get("R")));
  const variant = KDF_ARGON2[uuid];
  if (!variant) throw new KdbxUnsupportedError("KDF");
  if (readU32(get("V")) !== ARGON2_VERSION || kdf.get("K")?.length || kdf.get("A")?.length)
    throw new KdbxUnsupportedError("Argon2 parameters");
  return argon2(key, get("S"), {
    t: readU64(get("I")),
    m: readU64(get("M")) / 1024,
    p: readU32(get("P")),
    variant,
  });
}

function cipherOf(fields: Fields) {
  const id = bytesToHex(required(fields, Header.CipherId));
  if (id !== CIPHER_AES256 && id !== CIPHER_CHACHA20) throw new KdbxUnsupportedError("cipher");
  return id;
}

function decrypt(fields: Fields, key: Uint8Array, data: Uint8Array) {
  const iv = required(fields, Header.EncryptionIv);
  if (cipherOf(fields) === CIPHER_CHACHA20) return chacha20(key, iv, data);
  if (data.length % 16 !== 0) throw new Error("KDBX ciphertext truncated");
  try {
    return cbc(key, iv).decrypt(data);
  } catch {
    // Bad padding: the key is wrong.
    throw new KdbxInvalidKeyError();
  }
}

/** KDBX 3.1: SHA-256 per block, an empty block at the end. */
function readHashedBlocks(reader: Reader): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (;;) {
    reader.u32();
    const hash = reader.bytesOf(32);
    const data = reader.bytesOf(reader.i32());
    if (data.length === 0) return concatBytes(...blocks);
    if (!equalBytes(sha256(data), hash)) throw new Error("KDBX block hash mismatch");
    blocks.push(data);
  }
}

const blockHmacKey = (hmacKey: Uint8Array, index: bigint) =>
  sha512(concatBytes(u64le(index), hmacKey));

/** KDBX 4: HMAC-SHA-256 per block (key per block index), an empty block at the end. */
function readHmacBlocks(reader: Reader, hmacKey: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (let index = 0n; ; index++) {
    const mac = reader.bytesOf(32);
    const size = reader.i32();
    const data = reader.bytesOf(size);
    const expected = hmac(
      sha256,
      blockHmacKey(hmacKey, index),
      concatBytes(u64le(index), u32le(size), data),
    );
    if (!equalBytes(expected, mac)) throw new Error("KDBX block HMAC mismatch");
    if (size === 0) return concatBytes(...blocks);
    blocks.push(data);
  }
}

function innerStream(id: number, key: Uint8Array): (data: Uint8Array) => Uint8Array {
  if (id === STREAM_NONE) return (data) => data;
  if (id === STREAM_SALSA20) return (data) => salsa20(sha256(key), SALSA20_NONCE, data);
  if (id === STREAM_CHACHA20) {
    const hash = sha512(key);
    return (data) => chacha20(hash.subarray(0, 32), hash.subarray(32, 44), data);
  }
  throw new KdbxUnsupportedError("inner stream");
}

const escapeXml = (text: string) =>
  text
    .replace(/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const PROTECTED = /<(\w+)(\s[^>]*?)?\sProtected="True"([^>]*)>([^<]*)<\/\1>/g;

/**
 * Protected values are XORed with one inner stream in document order: decrypt
 * them all with a single keystream, then put each back in plain. Only `Value`s
 * are rewritten; other protected elements (attachments) just use up their part.
 */
function revealProtected(xml: string, stream: (data: Uint8Array) => Uint8Array): string {
  const matches = [...xml.matchAll(PROTECTED)];
  const ciphertexts = matches.map((match) => fromBase64(match[4]!.trim()));
  const plain = stream(concatBytes(...ciphertexts));
  const decoder = new TextDecoder();
  let offset = 0;
  let index = 0;
  return xml.replace(PROTECTED, (whole, tag: string, before = "", after: string) => {
    const length = ciphertexts[index++]!.length;
    const value = plain.subarray(offset, offset + length);
    offset += length;
    if (tag !== "Value") return whole;
    const attributes = `${before}${after}`.replace(/\sProtectInMemory="[^"]*"/, "");
    return `<${tag}${attributes} ProtectInMemory="True">${escapeXml(decoder.decode(value))}</${tag}>`;
  });
}

type Keys = { encryptionKey: Uint8Array; transformed: Uint8Array };

function readKdbx3(reader: Reader, fields: Fields, { encryptionKey }: Keys) {
  const plain = decrypt(fields, encryptionKey, reader.rest());
  const start = required(fields, Header.StreamStartBytes);
  if (!equalBytes(plain.subarray(0, start.length), start)) throw new KdbxInvalidKeyError();
  let payload = readHashedBlocks(new Reader(plain.subarray(start.length)));
  if (readU32(required(fields, Header.Compression))) payload = gunzipSync(payload);
  const stream = innerStream(
    readU32(required(fields, Header.InnerRandomStreamId)),
    required(fields, Header.ProtectedStreamKey),
  );
  return { xml: payload, stream };
}

function readKdbx4(reader: Reader, fields: Fields, header: Uint8Array, keys: Keys) {
  const masterSeed = required(fields, Header.MasterSeed);
  const hmacKey = sha512(concatBytes(masterSeed, keys.transformed, new Uint8Array([1])));
  const headerMac = hmac(sha256, blockHmacKey(hmacKey, 0xffff_ffff_ffff_ffffn), header);
  if (!equalBytes(headerMac, reader.bytesOf(32))) throw new KdbxInvalidKeyError();
  let payload = decrypt(fields, keys.encryptionKey, readHmacBlocks(reader, hmacKey));
  if (readU32(required(fields, Header.Compression))) payload = gunzipSync(payload);
  const inner = new Reader(payload);
  const innerFields = readFields(inner, inner.u32);
  const stream = innerStream(
    readU32(required(innerFields, InnerHeader.StreamId)),
    required(innerFields, InnerHeader.StreamKey),
  );
  return { xml: inner.rest(), stream };
}

export function isKdbx(file: Uint8Array): boolean {
  return KDBX_SIGNATURE.every((byte, i) => file[i] === byte);
}

/**
 * Decrypt a KeePass database to its XML. Throws `KdbxInvalidKeyError` for a
 * wrong password or key file, `KdbxUnsupportedError` for a format it can't
 * read, anything else for a damaged file.
 */
export async function openKdbx(
  file: Uint8Array,
  credentials: KdbxCredentials,
  argon2: KdbxArgon2 = (password, salt, { variant, ...opts }) =>
    argon2Async(variant, password, salt, opts),
): Promise<string> {
  if (!isKdbx(file)) throw new KdbxUnsupportedError("not a KDBX file");
  const reader = new Reader(file);
  reader.bytesOf(KDBX_SIGNATURE.length + 2);
  const major = reader.u16();
  if (major !== 3 && major !== 4) throw new KdbxUnsupportedError(`KDBX ${major}`);
  const fields = readFields(reader, major === 3 ? reader.u16 : reader.u32);
  const header = file.subarray(0, reader.position);
  if (major === 4 && !equalBytes(sha256(header), reader.bytesOf(32)))
    throw new Error("KDBX header damaged");
  cipherOf(fields);

  const transformed = await transformKey(compositeKey(credentials), fields, major, argon2);
  const keys = {
    transformed,
    encryptionKey: sha256(concatBytes(required(fields, Header.MasterSeed), transformed)),
  };
  const { xml, stream } =
    major === 3 ? readKdbx3(reader, fields, keys) : readKdbx4(reader, fields, header, keys);
  return revealProtected(new TextDecoder().decode(xml), stream);
}
