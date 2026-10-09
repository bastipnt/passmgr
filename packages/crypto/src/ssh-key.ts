import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, randomBytes } from "@noble/hashes/utils.js";
import { fromBase64, fromString, toBase64 } from "@repo/util";
import { wipe } from "./util/secrets-utils";

/*
 * SSH keys for the `ssh_key` record type, in OpenSSH's own formats: the
 * one-line public key (`ssh-ed25519 AAAA… comment`) and the `openssh-key-v1`
 * private key file (PROTOCOL.key in the OpenSSH sources). Only what the record
 * needs: generate an Ed25519 key, show a public key's fingerprint, and read
 * the public key out of an imported private key file.
 */

const MAGIC = fromString("openssh-key-v1\0");
const PEM_BEGIN = "-----BEGIN OPENSSH PRIVATE KEY-----";
const PEM_END = "-----END OPENSSH PRIVATE KEY-----";
const ED25519 = "ssh-ed25519";

function uint32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

/** An SSH wire-format `string`: a uint32 length, then the bytes. */
function sshString(value: Uint8Array | string): Uint8Array {
  const bytes = typeof value === "string" ? fromString(value) : value;
  return concatBytes(uint32(bytes.length), bytes);
}

class SshReader {
  private offset = 0;
  private readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  uint32(): number {
    if (this.offset + 4 > this.bytes.length) throw new Error("Truncated SSH key");
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  string(): Uint8Array {
    const length = this.uint32();
    if (this.offset + length > this.bytes.length) throw new Error("Truncated SSH key");
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  text(): string {
    return new TextDecoder().decode(this.string());
  }

  skip(length: number) {
    this.offset += length;
  }
}

function wrapPem(bytes: Uint8Array): string {
  const lines = toBase64(bytes).match(/.{1,70}/g) ?? [];
  return `${PEM_BEGIN}\n${lines.join("\n")}\n${PEM_END}\n`;
}

function unwrapPem(pem: string): Uint8Array {
  const start = pem.indexOf(PEM_BEGIN);
  const end = pem.indexOf(PEM_END);
  if (start === -1 || end === -1 || end < start) throw new Error("Not an OpenSSH private key");
  return fromBase64(pem.slice(start + PEM_BEGIN.length, end).replace(/\s/g, ""));
}

export type SshKeyPair = {
  /** One line, as in `id_ed25519.pub`. */
  publicKey: string;
  /** Unencrypted `openssh-key-v1` file, as in `id_ed25519`; the vault encrypts it. */
  privateKey: string;
};

/** A new Ed25519 key in OpenSSH's formats. `comment` ends up on the public key line. */
export function generateSshKeyPair(comment = ""): SshKeyPair {
  const seed = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(seed);
  const publicBlob = concatBytes(sshString(ED25519), sshString(publicKey));
  // OpenSSH stores the 64-byte form: seed followed by the public key.
  const secret = concatBytes(seed, publicKey);

  const check = randomBytes(4);
  let section = concatBytes(
    check,
    check,
    sshString(ED25519),
    sshString(publicKey),
    sshString(secret),
    sshString(comment),
  );
  // Padded to the cipher block size (8 for "none") with bytes 1, 2, 3, …
  const padding = Array.from({ length: (8 - (section.length % 8)) % 8 }, (_, i) => i + 1);
  section = concatBytes(section, new Uint8Array(padding));

  const file = concatBytes(
    MAGIC,
    sshString("none"),
    sshString("none"),
    sshString(""),
    uint32(1),
    sshString(publicBlob),
    sshString(section),
  );

  const privateKey = wrapPem(file);
  wipe(seed);
  wipe(secret);
  wipe(section);
  wipe(file);

  const publicLine = `${ED25519} ${toBase64(publicBlob)}`;
  return { publicKey: comment ? `${publicLine} ${comment}` : publicLine, privateKey };
}

/**
 * The public key line stored in an OpenSSH private key file. The public key
 * sits outside the encrypted part, so this works for passphrase-protected keys
 * too; the comment is only readable from an unencrypted one. `undefined` when
 * `privateKey` is not an `openssh-key-v1` file (e.g. an old PEM/PKCS#1 key).
 */
export function sshPublicKeyFromPrivateKey(privateKey: string): string | undefined {
  try {
    return readPublicKey(unwrapPem(privateKey));
  } catch {
    return undefined;
  }
}

function readPublicKey(file: Uint8Array): string {
  if (file.length < MAGIC.length || MAGIC.some((byte, i) => file[i] !== byte)) {
    throw new Error("Not an openssh-key-v1 file");
  }
  const reader = new SshReader(file.subarray(MAGIC.length));
  const cipher = reader.text();
  reader.string(); // kdf name
  reader.string(); // kdf options
  if (reader.uint32() < 1) throw new Error("No key in file");
  const publicBlob = reader.string();
  const keyType = new SshReader(publicBlob).text();

  let comment = "";
  if (cipher === "none") {
    const section = new SshReader(reader.string());
    section.skip(8); // check ints
    section.text(); // key type
    // The comment follows the key's own fields, whose layout depends on the
    // key type; only Ed25519's (public, secret) is read here.
    if (keyType === ED25519) {
      section.string();
      section.string();
      comment = section.text();
    }
  }

  const line = `${keyType} ${toBase64(publicBlob)}`;
  return comment ? `${line} ${comment}` : line;
}

/**
 * `SHA256:…` fingerprint of a one-line public key, as `ssh-keygen -l` prints
 * it. `undefined` when the line isn't an OpenSSH public key.
 */
export function sshKeyFingerprint(publicKey: string): string | undefined {
  const [keyType, data] = publicKey.trim().split(/\s+/);
  if (!keyType || !data) return undefined;
  try {
    const blob = fromBase64(data);
    // The blob starts with its own key type; a mismatch means a mangled line.
    if (new SshReader(blob).text() !== keyType) return undefined;
    return `SHA256:${toBase64(sha256(blob)).replace(/=+$/, "")}`;
  } catch {
    return undefined;
  }
}
