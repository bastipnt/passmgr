import { describe, expect, it } from "vitest";
import { generateSshKeyPair, sshKeyFingerprint, sshPublicKeyFromPrivateKey } from "../src/ssh-key";

// `ssh-keygen -t ed25519 -N "" -C test@example`, and the passphrase-protected
// copy of the same key (`ssh-keygen -p -N secret`).
const PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMk5TTjKvYt2fXcgU9jovWCt5PkExCus5i2+9D/hf2HA test@example";
// A throwaway test key, never used anywhere.
const ENCRYPTED_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABBu4+tYcy
yOtLP8m4+zzvVuAAAAGAAAAAEAAAAzAAAAC3NzaC1lZDI1NTE5AAAAIMk5TTjKvYt2fXcg
U9jovWCt5PkExCus5i2+9D/hf2HAAAAAkH2uKZiB3IKSzvh8EZ/PZV99gELRi+1NeqBNV1
y1PMeoA6rzBLwl/EAC11VSO74pW0OQK/keCKXr1aVW7zR3R2CQ07MAEw2P48yI8DjRWss8
ysT9kDblYqqyHNUYkLEMjUr1AXKy3lmgGVe+hr+hs0wwSVy0/uMApl08DnBtc5FdZf8dJ1
myvPdTJzWqYQQu2g==
-----END OPENSSH PRIVATE KEY-----
`;
const FINGERPRINT = "SHA256:dcQ/F9kOdnKBfKHQeHp2TAtEay17/DecDTQyoHCXkLA";

describe("generateSshKeyPair", () => {
  it("writes a private key file whose public key matches the public line", () => {
    const { publicKey, privateKey } = generateSshKeyPair("lin@laptop");

    expect(publicKey).toMatch(/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI\S+ lin@laptop$/);
    expect(privateKey).toMatch(/^-----BEGIN OPENSSH PRIVATE KEY-----\n/);
    expect(sshPublicKeyFromPrivateKey(privateKey)).toBe(publicKey);
  });

  it("leaves the comment off when there is none", () => {
    expect(generateSshKeyPair().publicKey.split(" ")).toHaveLength(2);
  });

  it("generates a new key every time", () => {
    expect(generateSshKeyPair().publicKey).not.toBe(generateSshKeyPair().publicKey);
  });
});

describe("sshKeyFingerprint", () => {
  it("matches ssh-keygen -l", () => {
    expect(sshKeyFingerprint(PUBLIC_KEY)).toBe(FINGERPRINT);
  });

  it.each([
    ["an empty line", ""],
    ["a key type only", "ssh-ed25519"],
    ["broken base64", "ssh-ed25519 not*base64"],
    ["a mismatched key type", PUBLIC_KEY.replace("ssh-ed25519", "ssh-rsa")],
  ])("is undefined for %s", (_, line) => {
    expect(sshKeyFingerprint(line)).toBeUndefined();
  });
});

describe("sshPublicKeyFromPrivateKey", () => {
  it("reads the public key of a passphrase-protected file, without its comment", () => {
    expect(sshPublicKeyFromPrivateKey(ENCRYPTED_PRIVATE_KEY)).toBe(
      PUBLIC_KEY.replace(" test@example", ""),
    );
  });

  it("is undefined for anything but an openssh-key-v1 file", () => {
    expect(sshPublicKeyFromPrivateKey("-----BEGIN RSA PRIVATE KEY-----\nAAAA\n")).toBeUndefined();
    expect(sshPublicKeyFromPrivateKey("hello")).toBeUndefined();
  });
});
